from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
import os
import zipfile

import numpy as np
import planetary_computer as pc
import pystac_client
import stackstac
import xarray as xr
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from shapely.geometry import shape
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds

router = APIRouter()

MPC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"


class MpcProcessRequest(BaseModel):
    aoi: Dict[str, Any]
    collections: List[str] = Field(default_factory=lambda: ["sentinel-2-l2a"])
    datetime: str
    template_id: Literal["ndvi_s2", "false_color_s2", "ndmi_s2", "ndvi_landsat", "false_color_landsat"]
    max_items: int = 20
    max_cloud_cover: Optional[float] = 20.0
    catalog_url: Optional[str] = None
    acs_zip_path: Optional[str] = None
    clip_to_aoi: bool = True
    tile_size: int = 1024
    resolution: int = 20


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


def _normalize_catalog_url(raw: Optional[str]) -> str:
    text = (raw or "").strip()
    if not text:
        return MPC_STAC_URL
    # Accept MPC catalog landing URL and convert to STAC API root.
    if text.rstrip("/").lower() == "https://planetarycomputer.microsoft.com/catalog":
        return MPC_STAC_URL
    if text.rstrip("/").lower().endswith("/api/stac/v1"):
        return text.rstrip("/")
    if text.lower().endswith("/search"):
        return text.rsplit("/", 1)[0]
    return text.rstrip("/")


def _catalog(catalog_url: Optional[str] = None) -> pystac_client.Client:
    return pystac_client.Client.open(_normalize_catalog_url(catalog_url), modifier=pc.sign_inplace)


def _read_acs_zip_entries(path: Optional[str]) -> List[str]:
    p = (path or "").strip()
    if not p:
        return []
    if not os.path.isfile(p):
        raise HTTPException(status_code=400, detail=f"ACS zip file not found: {p}")
    try:
        with zipfile.ZipFile(p, "r") as zf:
            return [n for n in zf.namelist() if n.lower().endswith(".acs")]
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail=f"Invalid ACS zip file: {p}") from exc


def _stack(
    items: List[Any],
    assets: List[str],
    bbox: tuple[float, float, float, float],
    *,
    resolution: int = 20,
    tile_size: int = 1024,
) -> xr.DataArray:
    return stackstac.stack(
        items,
        assets=assets,
        bounds_latlon=bbox,
        resolution=max(5, min(120, int(resolution))),
        epsg=4326,
        chunksize=max(256, min(4096, int(tile_size))),
        fill_value=np.nan,
    ).astype("float32")


def _clip_metric_to_aoi(metric: xr.DataArray, aoi_geom: Dict[str, Any], bbox: tuple[float, float, float, float]) -> xr.DataArray:
    """Mask pixels outside AOI polygon for true clip-to-AOI statistics."""
    x = metric.coords.get("x")
    y = metric.coords.get("y")
    if x is None or y is None:
        return metric
    width = int(x.size)
    height = int(y.size)
    if width <= 1 or height <= 1:
        return metric

    w, s, e, n = bbox
    transform = from_bounds(w, s, e, n, width, height)
    inside_mask = geometry_mask(
        [aoi_geom],
        out_shape=(height, width),
        transform=transform,
        invert=True,
        all_touched=False,
    )
    mask_da = xr.DataArray(inside_mask, coords={"y": metric["y"], "x": metric["x"]}, dims=("y", "x"))
    return metric.where(mask_da)


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

    cat = _catalog(req.catalog_url)
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

    arr = _stack(
        items,
        template["assets"],
        bbox,
        resolution=req.resolution,
        tile_size=req.tile_size,
    )
    metric = _compute(req.template_id, arr).median(dim="time", skipna=True)
    if req.clip_to_aoi:
        metric = _clip_metric_to_aoi(metric, req.aoi["geometry"] if req.aoi.get("type") == "Feature" else req.aoi, bbox)
    metric = metric.where(np.isfinite(metric))

    min_v = float(metric.min(skipna=True).compute().item())
    max_v = float(metric.max(skipna=True).compute().item())
    mean_v = float(metric.mean(skipna=True).compute().item())
    std_v = float(metric.std(skipna=True).compute().item())
    if not all(np.isfinite(v) for v in (min_v, max_v, mean_v, std_v)):
        raise HTTPException(status_code=422, detail="No valid pixels after clipping/filtering. Expand AOI or disable clip-to-AOI.")

    acs_entries = _read_acs_zip_entries(req.acs_zip_path)

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
        "catalog_url": _normalize_catalog_url(req.catalog_url),
        "processing": {
            "clip_to_aoi": req.clip_to_aoi,
            "tile_size": max(256, min(4096, int(req.tile_size))),
            "resolution": max(5, min(120, int(req.resolution))),
            "mode": "tile-based on-the-fly",
        },
        "acs": {
            "zip_path": req.acs_zip_path,
            "entries_count": len(acs_entries),
            "entries_preview": acs_entries[:10],
        },
    }


# Optical indices sampled from the same Sentinel-2 stack (EPSG:4326 grid, AOI-clipped).
_ZONAL_LAYER_ASSETS = ["B02", "B03", "B04", "B08", "B11"]
_ZONAL_LAYER_IDS = ("NDVI", "NDWI", "NDMI", "EVI", "SAVI", "NDSI", "NDBI", "GNDVI")


class MpcZonalSampleRequest(BaseModel):
    aoi: Dict[str, Any]
    datetime: str
    layer_ids: List[str] = Field(default_factory=lambda: list(_ZONAL_LAYER_IDS))
    collections: List[str] = Field(default_factory=lambda: ["sentinel-2-l2a"])
    max_items: int = 20
    max_cloud_cover: Optional[float] = 20.0
    catalog_url: Optional[str] = None
    clip_to_aoi: bool = True
    tile_size: int = 1024
    resolution: int = 20
    max_pixels: int = 9000


def _metric_for_layer(layer_id: str, arr: xr.DataArray) -> xr.DataArray:
    lid = layer_id.strip().upper()
    if lid == "NDVI":
        red = arr.sel(band="B04")
        nir = arr.sel(band="B08")
        return (nir - red) / (nir + red + 1e-6)
    if lid == "NDWI":
        green = arr.sel(band="B03")
        nir = arr.sel(band="B08")
        return (green - nir) / (green + nir + 1e-6)
    if lid == "NDMI":
        nir = arr.sel(band="B08")
        swir = arr.sel(band="B11")
        return (nir - swir) / (nir + swir + 1e-6)
    if lid == "EVI":
        blue = arr.sel(band="B02")
        red = arr.sel(band="B04")
        nir = arr.sel(band="B08")
        return 2.5 * (nir - red) / (nir + 6.0 * red - 7.5 * blue + 1.0)
    if lid == "SAVI":
        red = arr.sel(band="B04")
        nir = arr.sel(band="B08")
        return 1.5 * (nir - red) / (nir + red + 0.5)
    if lid == "NDSI":
        green = arr.sel(band="B03")
        swir = arr.sel(band="B11")
        return (green - swir) / (green + swir + 1e-6)
    if lid == "NDBI":
        swir = arr.sel(band="B11")
        nir = arr.sel(band="B08")
        return (swir - nir) / (swir + nir + 1e-6)
    if lid == "GNDVI":
        nir = arr.sel(band="B08")
        green = arr.sel(band="B03")
        return (nir - green) / (nir + green + 1e-6)
    raise HTTPException(status_code=400, detail=f"Unsupported layer id for zonal sampling: {layer_id}")


def _layer_statistics(values: List[float], histogram_bins: int = 24) -> Dict[str, Any]:
    arr = np.array([float(v) for v in values if np.isfinite(v)], dtype=np.float64)
    if arr.size == 0:
        return {}
    hist_counts, bin_edges = np.histogram(arr, bins=max(8, min(48, int(histogram_bins))))
    histogram = [
        {
            "binStart": float(bin_edges[i]),
            "binEnd": float(bin_edges[i + 1]),
            "count": int(hist_counts[i]),
        }
        for i in range(len(hist_counts))
    ]
    return {
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "mean": float(np.mean(arr)),
        "median": float(np.median(arr)),
        "std": float(np.std(arr)),
        "histogram": histogram,
    }


def _extract_aligned_aoi_pixels(
    metrics: Dict[str, xr.DataArray],
    layer_ids: List[str],
    aoi_geom: Dict[str, Any],
    bbox: tuple[float, float, float, float],
    max_pixels: int,
) -> tuple[List[Dict[str, float]], Dict[str, List[float]]]:
    """One shared lng/lat grid; per-layer values aligned by pixel index (reference = first layer)."""
    ref_id = layer_ids[0]
    clipped_ref = _clip_metric_to_aoi(metrics[ref_id], aoi_geom, bbox)
    x = clipped_ref.coords["x"].values
    y = clipped_ref.coords["y"].values
    height = int(y.size)
    width = int(x.size)
    if height <= 0 or width <= 0:
        return [], {}

    ref2d = np.squeeze(clipped_ref.values)
    if ref2d.ndim != 2:
        return [], {}

    per_layer: Dict[str, List[float]] = {lid: [] for lid in layer_ids}
    grid_full: List[Dict[str, float]] = []

    clipped_by_layer = {lid: _clip_metric_to_aoi(metrics[lid], aoi_geom, bbox) for lid in layer_ids}
    vals2d = {lid: np.squeeze(clipped_by_layer[lid].values) for lid in layer_ids}

    for j in range(height):
        lat = float(y[j])
        for i in range(width):
            v_ref = float(ref2d[j, i])
            if not np.isfinite(v_ref):
                continue
            grid_full.append({"lng": float(x[i]), "lat": lat})
            for lid in layer_ids:
                arr = vals2d[lid]
                v = float(arr[j, i]) if arr.ndim == 2 else float("nan")
                per_layer[lid].append(v if np.isfinite(v) else float("nan"))

    cap = max(100, min(12000, int(max_pixels)))
    if len(grid_full) <= cap:
        return grid_full, per_layer

    stride = len(grid_full) / cap
    grid_out: List[Dict[str, float]] = []
    layers_out: Dict[str, List[float]] = {lid: [] for lid in layer_ids}
    for k in range(cap):
        idx = min(len(grid_full) - 1, int(k * stride))
        grid_out.append(grid_full[idx])
        for lid in layer_ids:
            layers_out[lid].append(per_layer[lid][idx])
    return grid_out, layers_out


@router.post("/live/analyze")
def live_analyze(req: MpcZonalSampleRequest):
    """Alias for AOI live spectral analysis — real pixels from STAC stack inside AOI."""
    return zonal_sample(req)


@router.post("/zonal-sample")
def zonal_sample(req: MpcZonalSampleRequest):
    """Raster pixel sampling inside AOI polygon (stackstac + geometry mask)."""
    layer_ids = [str(lid).strip().upper() for lid in (req.layer_ids or []) if str(lid).strip()]
    if not layer_ids:
        raise HTTPException(status_code=400, detail="At least one layer id is required")
    for lid in layer_ids:
        if lid not in _ZONAL_LAYER_IDS:
            raise HTTPException(status_code=400, detail=f"Unsupported layer id: {lid}")

    collections = req.collections or ["sentinel-2-l2a"]
    try:
        aoi_geom = req.aoi["geometry"] if req.aoi.get("type") == "Feature" else req.aoi
        bbox = shape(aoi_geom).bounds
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid AOI geometry: {exc}") from exc

    query: Dict[str, Any] = {}
    if req.max_cloud_cover is not None:
        query["eo:cloud_cover"] = {"lt": float(req.max_cloud_cover)}

    cat = _catalog(req.catalog_url)
    search = cat.search(
        collections=collections,
        intersects=aoi_geom,
        datetime=req.datetime,
        query=query if query else None,
        limit=max(1, min(200, int(req.max_items))),
    )
    items = list(search.items())
    if not items:
        raise HTTPException(status_code=404, detail="No STAC items found for the requested AOI/date range")

    arr = _stack(
        items,
        _ZONAL_LAYER_ASSETS,
        bbox,
        resolution=req.resolution,
        tile_size=req.tile_size,
    )
    median = arr.median(dim="time", skipna=True)
    metrics = {lid: _metric_for_layer(lid, median) for lid in layer_ids}
    shared_grid, per_layer_values = _extract_aligned_aoi_pixels(
        metrics,
        layer_ids,
        aoi_geom,
        bbox,
        req.max_pixels,
    )

    layers_out: Dict[str, Any] = {}
    for lid in layer_ids:
        raw = per_layer_values.get(lid) or []
        values = [float(v) for v in raw if np.isfinite(v)]
        if not values:
            continue
        stats = _layer_statistics(values)
        layers_out[lid] = {
            "statistics": stats,
            "values": [float(v) for v in raw],
        }

    if not shared_grid or not layers_out:
        raise HTTPException(
            status_code=422,
            detail="No valid raster pixels inside AOI after clipping. Expand AOI or widen the date range.",
        )

    from shapely.geometry import shape as shp_shape

    centroid_lat = (bbox[1] + bbox[3]) / 2.0
    area_m2_geom = float(shp_shape(aoi_geom).area) * (111_320.0**2) * np.cos(np.radians(centroid_lat))
    res_m = max(5, min(120, int(req.resolution)))
    area_m2_est = len(shared_grid) * (res_m**2)
    area_ha = max(area_m2_geom, area_m2_est) / 10_000.0

    return {
        "ok": True,
        "datetime": req.datetime,
        "item_count": len(items),
        "pixel_count": len(shared_grid),
        "area_ha": area_ha,
        "grid": shared_grid,
        "layers": layers_out,
        "processing": {
            "clip_to_aoi": req.clip_to_aoi,
            "resolution_m": res_m,
            "mode": "stackstac-raster-pixel-sampling",
        },
    }
