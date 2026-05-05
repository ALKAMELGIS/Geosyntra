"""
Microsoft Planetary Computer STAC + stackstac processing templates.

Catalog: https://planetarycomputer.microsoft.com/catalog
ArcGIS + MPC overview: https://github.com/Esri/arcgis-for-mpc
"""

from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import numpy as np
import planetary_computer
import pystac_client
import stackstac
import xarray as xr
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from shapely.geometry import mapping, shape

router = APIRouter()

STAC_API_URL = os.getenv("MPC_STAC_URL", "https://planetarycomputer.microsoft.com/api/stac/v1")

_COG_DIR = Path(os.getenv("MPC_COG_DIR", str(Path(tempfile.gettempdir()) / "mpc_cogs")))
_COG_DIR.mkdir(parents=True, exist_ok=True)
_COG_INDEX: Dict[str, Path] = {}


class StacSearchRequest(BaseModel):
    collections: List[str] = Field(default_factory=lambda: ["sentinel-2-l2a"])
    datetime: str = Field(..., description="ISO interval e.g. 2024-01-01/2024-06-01")
    limit: int = Field(10, ge=1, le=100)
    bbox: Optional[List[float]] = Field(None, description="west,south,east,north in WGS84")
    intersects: Optional[Dict[str, Any]] = Field(None, description="GeoJSON geometry")
    query: Optional[Dict[str, Any]] = None


class ProcessRequest(BaseModel):
    aoi: Dict[str, Any] = Field(..., description="GeoJSON Polygon / Feature / FeatureCollection")
    collections: List[str] = Field(default_factory=lambda: ["sentinel-2-l2a"])
    datetime: str = Field(...)
    template_id: Literal[
        "ndvi_s2",
        "false_color_s2",
        "ndmi_s2",
        "ndvi_landsat",
        "false_color_landsat",
    ]
    max_items: int = Field(1, ge=1, le=5)
    max_cloud_cover: Optional[float] = Field(30.0)


def _extract_polygon(aoi: Dict[str, Any]) -> Any:
    t = aoi.get("type")
    if t == "Polygon":
        return aoi
    if t == "Feature":
        g = aoi.get("geometry")
        if isinstance(g, dict) and g.get("type") == "Polygon":
            return g
    if t == "FeatureCollection":
        feats = aoi.get("features") or []
        if feats and isinstance(feats[0], dict):
            g = feats[0].get("geometry")
            if isinstance(g, dict) and g.get("type") == "Polygon":
                return g
    raise ValueError("AOI must be a Polygon (or one polygon in a Feature / FeatureCollection)")


def _open_catalog():
    return pystac_client.Client.open(STAC_API_URL)


def _sign_items(items):
    return [planetary_computer.sign(it) for it in items]


def _stack_composite(signed_items: List[Any], assets: List[str], bbox4326: Tuple[float, float, float, float]) -> xr.DataArray:
    stack = stackstac.stack(
        signed_items,
        assets=assets,
        bounds_latlon=bbox4326,
        epsg=3857,
        resolution=30,
        chunksize=2048,
    )
    if stack.sizes.get("time", 0) > 1:
        stack = stack.median(dim="time")
    else:
        stack = stack.squeeze("time", drop=True)
    return stack


def _apply_template(template_id: str, stack: xr.DataArray) -> Tuple[xr.DataArray, Dict[str, Any]]:
    ds = stack.to_dataset(dim="band")
    meta: Dict[str, Any] = {"rescale": [-1.0, 1.0], "label": template_id}

    if template_id == "ndvi_s2":
        red = ds["B04"].astype("float64")
        nir = ds["B08"].astype("float64")
        out = (nir - red) / (nir + red + 1e-9)
        meta = {"rescale": [-1.0, 1.0], "label": "NDVI (Sentinel-2)"}
    elif template_id == "ndmi_s2":
        nir = ds["B08"].astype("float64")
        swir = ds["B11"].astype("float64")
        out = (nir - swir) / (nir + swir + 1e-9)
        meta = {"rescale": [-1.0, 1.0], "label": "NDMI — moisture (Sentinel-2)"}
    elif template_id == "false_color_s2":
        swir = ds["B12"].astype("float64")
        nir = ds["B08"].astype("float64")
        red = ds["B04"].astype("float64")
        mx = float(np.nanmax(np.stack([swir.values, nir.values, red.values])))
        mx = mx if mx > 1e-6 else 1.0
        out = xr.concat([swir / mx, nir / mx, red / mx], dim="band").assign_coords(band=["R", "G", "B"])
        meta = {"rescale": [0.0, 1.0], "label": "False color SWIR–NIR–Red"}
    elif template_id == "ndvi_landsat":
        red = ds["red"].astype("float64")
        nir = ds["nir08"].astype("float64")
        out = (nir - red) / (nir + red + 1e-9)
        meta = {"rescale": [-1.0, 1.0], "label": "NDVI (Landsat C2)"}
    elif template_id == "false_color_landsat":
        swir = ds["swir16"].astype("float64")
        nir = ds["nir08"].astype("float64")
        red = ds["red"].astype("float64")
        mx = float(np.nanmax(np.stack([swir.values, nir.values, red.values])))
        mx = mx if mx > 1e-6 else 1.0
        out = xr.concat([swir / mx, nir / mx, red / mx], dim="band").assign_coords(band=["R", "G", "B"])
        meta = {"rescale": [0.0, 1.0], "label": "False color (Landsat)"}
    else:
        raise ValueError(f"Unknown template {template_id}")

    out.attrs.update(meta)
    return out, meta


def _stats(da: xr.DataArray) -> Dict[str, float]:
    if "band" in da.dims:
        da = da.mean(dim="band")
    arr = da.values[np.isfinite(da.values)]
    if arr.size == 0:
        return {"min": float("nan"), "max": float("nan"), "mean": float("nan"), "std": float("nan")}
    return {
        "min": float(np.nanmin(arr)),
        "max": float(np.nanmax(arr)),
        "mean": float(np.nanmean(arr)),
        "std": float(np.nanstd(arr)),
    }


def _write_cog(da: xr.DataArray, path: Path) -> None:
    da.rio.to_raster(path, driver="COG")


def _assets_for_template(template_id: str) -> List[str]:
    if template_id == "ndvi_s2":
        return ["B04", "B08"]
    if template_id == "ndmi_s2":
        return ["B08", "B11"]
    if template_id == "false_color_s2":
        return ["B12", "B08", "B04"]
    if template_id == "ndvi_landsat":
        return ["red", "nir08"]
    if template_id == "false_color_landsat":
        return ["swir16", "nir08", "red"]
    raise ValueError(f"Unknown template {template_id}")


@router.get("/health")
async def mpc_health():
    return {"status": "ok", "stac": STAC_API_URL}


@router.get("/templates")
async def mpc_templates():
    return {
        "catalog_url": "https://planetarycomputer.microsoft.com/catalog",
        "stac_api": STAC_API_URL,
        "templates": [
            {"id": "ndvi_s2", "label": "NDVI", "collections": ["sentinel-2-l2a"], "formula": "(NIR-RED)/(NIR+RED)"},
            {"id": "false_color_s2", "label": "False color", "collections": ["sentinel-2-l2a"], "bands": "B12,B08,B04"},
            {"id": "ndmi_s2", "label": "NDMI (moisture)", "collections": ["sentinel-2-l2a"], "formula": "(NIR-SWIR)/(NIR+SWIR)"},
            {"id": "ndvi_landsat", "label": "NDVI (Landsat)", "collections": ["landsat-c2-l2"]},
            {"id": "false_color_landsat", "label": "False color (Landsat)", "collections": ["landsat-c2-l2"]},
        ],
        "arcgis": {
            "documentation_urls": [
                "https://github.com/Esri/arcgis-for-mpc",
                "https://planetarycomputer.microsoft.com/catalog",
            ]
        },
    }


@router.post("/stac/search")
async def mpc_stac_search(req: StacSearchRequest):
    catalog = _open_catalog()
    kwargs: Dict[str, Any] = {
        "collections": req.collections,
        "datetime": req.datetime,
        "limit": req.limit,
    }
    if req.bbox is not None and len(req.bbox) == 4:
        kwargs["bbox"] = req.bbox
    elif req.intersects is not None:
        kwargs["intersects"] = req.intersects
    if req.query:
        kwargs["query"] = req.query
    try:
        search = catalog.search(**kwargs)
        items = search.item_collection()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    feats = [it.to_dict() for it in items]
    times = [str((it.properties or {}).get("datetime") or (it.properties or {}).get("start_datetime") or "") for it in items]
    return {"type": "FeatureCollection", "features": feats, "scene_datetimes": [t for t in times if t], "count": len(feats)}


@router.post("/process")
async def mpc_process(req: ProcessRequest):
    poly = _extract_polygon(req.aoi)
    geom = shape(poly)
    bbox4326 = geom.bounds

    primary = req.collections[0] if req.collections else "sentinel-2-l2a"
    catalog = _open_catalog()
    query: Dict[str, Any] = {}
    if req.max_cloud_cover is not None and "sentinel" in primary.lower():
        query["eo:cloud_cover"] = {"lt": req.max_cloud_cover}

    try:
        search_kw: Dict[str, Any] = dict(
            collections=req.collections,
            datetime=req.datetime,
            intersects=mapping(geom),
            limit=req.max_items,
        )
        if query:
            search_kw["query"] = query
        search = catalog.search(**search_kw)
        items = search.item_collection()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"STAC search failed: {e}")

    if len(items) == 0:
        raise HTTPException(status_code=404, detail="No STAC items for this AOI, datetime, and filters.")

    signed = _sign_items(items)
    scene_datetimes = [
        str((it.properties or {}).get("datetime") or (it.properties or {}).get("start_datetime") or "") for it in items
    ]

    assets = _assets_for_template(req.template_id)
    try:
        stack = _stack_composite(signed, assets, bbox4326)
        da, meta = _apply_template(req.template_id, stack)
        stats = _stats(da)
        cog_id = str(uuid.uuid4())
        cog_path = _COG_DIR / f"{cog_id}.tif"
        _write_cog(da, cog_path)
        _COG_INDEX[cog_id] = cog_path
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")

    return {
        "ok": True,
        "template_id": req.template_id,
        "collections": req.collections,
        "datetime": req.datetime,
        "item_count": len(items),
        "scene_datetimes": [t for t in scene_datetimes if t],
        "statistics": stats,
        "rescale": list(meta.get("rescale", [-1.0, 1.0])),
        "label": meta.get("label", req.template_id),
        "cog_id": cog_id,
        "cog_download_path": f"/mpc/cog/{cog_id}",
        "arcgis": {
            "note": "Publish COGs via ArcGIS Pro / image services, or follow Esri arcgis-for-mpc documentation.",
            "links": ["https://github.com/Esri/arcgis-for-mpc"],
        },
    }


@router.get("/cog/{cog_id}")
async def mpc_download_cog(cog_id: str):
    path = _COG_INDEX.get(cog_id)
    if not path or not path.is_file():
        raise HTTPException(status_code=404, detail="COG not found or expired.")
    return FileResponse(path, media_type="image/tiff", filename=f"mpc-{cog_id}.tif")


@router.get("/export/arcgis-note")
async def mpc_arcgis_note():
    return JSONResponse(
        {
            "title": "ArcGIS + Microsoft Planetary Computer",
            "repository": "https://github.com/Esri/arcgis-for-mpc",
            "mpc_catalog": "https://planetarycomputer.microsoft.com/catalog",
        }
    )
