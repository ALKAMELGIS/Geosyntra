"""
Planetary Computer STAC + Sentinel-2 L2A NDVI helpers (Plotly, Folium, Rioxarray).
API reference: https://github.com/microsoft/planetary-computer-apis
"""
from __future__ import annotations

import warnings
from typing import Any

import numpy as np
import pandas as pd
import planetary_computer as pc
import plotly.graph_objects as go
import rioxarray
from folium import plugins
from pystac_client import Client
from shapely.geometry import Polygon, mapping

warnings.filterwarnings("ignore")

PC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
SENTINEL_COLLECTION = "sentinel-2-l2a"

DEFAULT_AOI: dict[str, Any] = {
    "type": "Polygon",
    "coordinates": [
        [
            [55.10, 25.00],
            [55.30, 25.00],
            [55.30, 25.20],
            [55.10, 25.20],
            [55.10, 25.00],
        ]
    ],
}


def connect_stac(url: str = PC_STAC_URL) -> Client:
    try:
        return Client.open(url)
    except Exception as e:
        raise RuntimeError(f"Failed to connect to STAC API: {e}") from e


def create_aoi_from_coords(coords_lon_lat: list[list[float]]) -> dict[str, Any]:
    """coords_lon_lat: exterior ring [[lon, lat], ...] closed ring."""
    poly = Polygon([(c[0], c[1]) for c in coords_lon_lat])
    return mapping(poly)


def search_sentinel2_items(
    catalog: Client,
    aoi: dict[str, Any],
    start_date: str,
    end_date: str,
    max_cloud: float = 20,
    max_items: int = 40,
) -> list[Any]:
    search = catalog.search(
        collections=[SENTINEL_COLLECTION],
        intersects=aoi,
        datetime=f"{start_date}/{end_date}",
        query={"eo:cloud_cover": {"lt": max_cloud}},
        max_items=max_items,
    )
    return list(search.items())


def calculate_ndvi(item: Any) -> Any:
    signed = pc.sign(item)
    red = rioxarray.open_rasterio(signed.assets["red"].href)
    nir = rioxarray.open_rasterio(signed.assets["nir"].href)
    red, nir = red.rio.reproject_match(nir)
    return (nir - red) / (nir + red)


def extract_ndvi_stats(ndvi_array: Any, aoi: dict[str, Any]) -> dict[str, float]:
    try:
        clipped = ndvi_array.rio.clip([aoi], drop=True)
        arr = clipped.values[np.isfinite(clipped.values)]
    except Exception:
        arr = ndvi_array.values[np.isfinite(ndvi_array.values)]

    if arr.size == 0:
        return {"mean": float("nan"), "min": float("nan"), "max": float("nan"), "std": float("nan"), "median": float("nan")}

    return {
        "mean": float(np.nanmean(arr)),
        "min": float(np.nanmin(arr)),
        "max": float(np.nanmax(arr)),
        "std": float(np.nanstd(arr)),
        "median": float(np.nanmedian(arr)),
    }


def create_interactive_map(center_lat: float, center_lon: float, aoi_geojson: dict[str, Any]):
    import folium

    m = folium.Map(location=[center_lat, center_lon], zoom_start=11, tiles="CartoDB dark_matter")
    folium.GeoJson(
        aoi_geojson,
        style_function=lambda _: {
            "fillColor": "#22c55e",
            "color": "#4ade80",
            "weight": 2,
            "fillOpacity": 0.22,
        },
    ).add_to(m)
    plugins.Fullscreen().add_to(m)
    return m


def generate_ndvi_plot(results_df: pd.DataFrame) -> go.Figure:
    from plotly.subplots import make_subplots

    fig = make_subplots(
        rows=2,
        cols=1,
        subplot_titles=("NDVI time series", "Cloud cover vs mean NDVI"),
        vertical_spacing=0.14,
    )
    fig.add_trace(
        go.Scatter(
            x=results_df["date"],
            y=results_df["ndvi_mean"],
            mode="lines+markers",
            name="Mean NDVI",
            line=dict(color="#22c55e", width=2),
            marker=dict(size=8, color="#15803d"),
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=pd.concat([results_df["date"], results_df["date"][::-1]], ignore_index=True),
            y=pd.concat([results_df["ndvi_max"], results_df["ndvi_min"][::-1]], ignore_index=True),
            fill="toself",
            fillcolor="rgba(34,197,94,0.15)",
            line=dict(color="rgba(0,0,0,0)"),
            name="Range",
            hoverinfo="skip",
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=results_df["cloud_cover"],
            y=results_df["ndvi_mean"],
            mode="markers",
            name="Scenes",
            marker=dict(size=10, color=results_df["cloud_cover"], colorscale="Viridis", showscale=True),
            text=results_df["date_str"],
            hovertemplate="Date: %{text}<br>Cloud: %{x:.1f}%<br>NDVI: %{y:.3f}<extra></extra>",
        ),
        row=2,
        col=1,
    )
    fig.update_xaxes(title_text="Date", row=1, col=1, gridcolor="rgba(148,163,184,0.2)")
    fig.update_yaxes(title_text="NDVI", range=[-0.2, 1.0], row=1, col=1, gridcolor="rgba(148,163,184,0.2)")
    fig.update_xaxes(title_text="Cloud cover %", row=2, col=1, gridcolor="rgba(148,163,184,0.2)")
    fig.update_yaxes(title_text="Mean NDVI", row=2, col=1, gridcolor="rgba(148,163,184,0.2)")
    fig.update_layout(
        height=600,
        title_text="Sentinel-2 NDVI analysis",
        plot_bgcolor="rgba(15,23,42,0.55)",
        paper_bgcolor="rgba(2,6,23,0.92)",
        font=dict(color="#e2e8f0"),
        showlegend=True,
        legend=dict(orientation="h", yanchor="bottom", y=1.05),
    )
    return fig


def export_results(results_df: pd.DataFrame, fmt: str = "csv") -> str | bytes:
    if fmt == "csv":
        return results_df.to_csv(index=False)
    if fmt == "json":
        return results_df.to_json(orient="records", date_format="iso")
    raise ValueError("format must be csv or json")


def vegetation_health_label(mean_ndvi: float) -> tuple[str, str]:
    if mean_ndvi < 0.2:
        return ("Poor / sparse", "Bare soil, urban, or very sparse cover.")
    if mean_ndvi < 0.4:
        return ("Fair", "Sparse vegetation or mixed desert patches.")
    if mean_ndvi < 0.6:
        return ("Good", "Moderate vegetation or active crops.")
    return ("Excellent", "Dense canopy or well-irrigated fields.")


def aoi_center_latlon(a_coords: list[list[float]]) -> tuple[float, float]:
    lats = [p[1] for p in a_coords if len(p) >= 2]
    lons = [p[0] for p in a_coords if len(p) >= 2]
    return (sum(lats) / len(lats), sum(lons) / len(lons))
