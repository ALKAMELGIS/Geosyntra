from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

import numpy as np
import planetary_computer as pc
import pystac_client
import stackstac
import xarray as xr
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from shapely.geometry import shape

router = APIRouter()

MPC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"


class MpcProcessRequest(BaseModel):
    aoi: Dict[str, Any]
    collections: List[str] = Field(default_factory=lambda: ["sentinel-2-l2a"])
    datetime: str
    template_id: Literal["ndvi_s2", "false_color_s2", "ndmi_s2", "ndvi_landsat", "false_color_landsat"]
    max_items: int = 20
    max_cloud_cover: Optional[float] = 20.0


TEMPLATES: Dict[str, Dict[str, Any]] = {
    "ndvi_s2": {
        "label": "NDVI (Sentinel-2)",
        "collections": ["sentinel-2-l2a"],
        "assets": ["B04", "B08"],
        "kind": "index",
        "formula": "(nir - red) / (nir + red + 1e-6)",
        "bands": {"red": "B04", "nir": "B08"},
    },
    "false_color_s2": {
        "label": "False Color (Sentinel-2)",
        "collections": ["sentinel-2-l2a"],
        "assets": ["B08", "B04", "B03"],
        "kind": "rgb",
        "bands": {"r": "B08", "g": "B04", "b": "B03"},
    },
    "ndmi_s2": {
        "label": "Moisture Index / NDMI (Sentinel-2)",
        "collections": ["sentinel-2-l2a"],
        "assets": ["B08", "B11"],
        "kind": "index",
        "formula": "(nir - swir) / (nir + swir + 1e-6)",
        "bands": {"nir": "B08", "swir": "B11"},
    },
    "ndvi_landsat": {
        "label": "NDVI (Landsat-8/9)",
        "collections": ["landsat-c2-l2"],
        "assets": ["red", "nir08"],
        "kind": "index",
        "formula": "(nir - red) / (nir + red + 1e-6)",
        "bands": {"red": "red", "nir": "nir08"},
    },
    "false_color_landsat": {
        "label": "False Color (Landsat-8/9)",
        "collections": ["landsat-c2-l2"],
        "assets": ["swir16", "nir08", "red"],
        "kind": "rgb",
        "bands": {"r": "swir16", "g": "nir08", "b": "red"},
    },
}


def _catalog() -> pystac_client.Client:
    return pystac_client.Client.open(MPC_STAC_URL, modifier=pc.sign_inplace)


def _stack(items: List[Any], assets: List[str], bbox: tuple[float, float, float, float]) -> xr.DataArray:
    return stackstac.stack(
        items,
        assets=assets,
        bounds_latlon=bbox,
        resolution=20,
        epsg=4326,
        chunksize=1024,
        fill_value=np.nan,
    ).astype("float32")


def _compute(template_id: str, arr: xr.DataArray) -> xr.DataArray:
    t = TEMPLATES[template_id]
    bands = t["bands"]
    if t["kind"] == "index":
        if template_id in ("ndvi_s2", "ndvi_landsat"):
            red = arr.sel(band=bands["red"])
            nir = arr.sel(band=bands["nir"])
            return (nir - red) / (nir + red + 1e-6)
        if template_id == "ndmi_s2":
            nir = arr.sel(band=bands["nir"])
            swir = arr.sel(band=bands["swir"])
            return (nir - swir) / (nir + swir + 1e-6)
    # For RGB templates, return normalized first display channel as quick analytics surface.
    r = arr.sel(band=bands["r"])
    return r / (r.max(skipna=True) + 1e-6)


@router.get("/templates")
def templates():
    return {
        "catalog_url": MPC_STAC_URL,
        "stac_api": f"{MPC_STAC_URL}/search",
        "templates": [{"id": k, "label": v["label"], "collections": v.get("collections", [])} for k, v in TEMPLATES.items()],
        "arcgis": {
            "documentation_urls": [
                "https://planetarycomputer.microsoft.com/catalog",
                "https://github.com/Esri/arcgis-for-mpc",
            ]
        },
    }


@router.post("/process")
def process(req: MpcProcessRequest):
    if req.template_id not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Unknown template: {req.template_id}")

    template = TEMPLATES[req.template_id]
    collections = req.collections or template.get("collections", [])
    if not collections:
        raise HTTPException(status_code=400, detail="At least one collection is required")

    try:
        bbox = shape(req.aoi["geometry"] if req.aoi.get("type") == "Feature" else req.aoi).bounds
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid AOI geometry: {exc}") from exc

    query: Dict[str, Any] = {}
    if req.max_cloud_cover is not None:
        query["eo:cloud_cover"] = {"lt": float(req.max_cloud_cover)}

    cat = _catalog()
    search = cat.search(
        collections=collections,
        intersects=req.aoi["geometry"] if req.aoi.get("type") == "Feature" else req.aoi,
        datetime=req.datetime,
        query=query if query else None,
        limit=max(1, min(200, int(req.max_items))),
    )
    items = list(search.items())
    if not items:
        raise HTTPException(status_code=404, detail="No STAC items found for the requested AOI/date range")

    arr = _stack(items, template["assets"], bbox)
    metric = _compute(req.template_id, arr).median(dim="time", skipna=True)
    metric = metric.where(np.isfinite(metric))

    min_v = float(metric.min(skipna=True).compute().item())
    max_v = float(metric.max(skipna=True).compute().item())
    mean_v = float(metric.mean(skipna=True).compute().item())
    std_v = float(metric.std(skipna=True).compute().item())

    return {
        "ok": True,
        "template_id": req.template_id,
        "label": template["label"],
        "collections": collections,
        "datetime": req.datetime,
        "item_count": len(items),
        "scene_datetimes": [str(getattr(item, "datetime", "") or "") for item in items[:10]],
        "statistics": {"min": min_v, "max": max_v, "mean": mean_v, "std": std_v},
        "detail": f"Processed with stackstac assets: {', '.join(template['assets'])}",
    }
