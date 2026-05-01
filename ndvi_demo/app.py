"""
Streamlit NDVI time series demo (Planetary Computer STAC).
Docs: https://github.com/microsoft/planetary-computer-apis
"""
from datetime import date, datetime

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

from utils import (
    DEFAULT_AOI,
    aoi_center_latlon,
    connect_stac,
    create_aoi_from_coords,
    create_interactive_map,
    vegetation_health_label,
    calculate_ndvi,
    export_results,
    extract_ndvi_stats,
    generate_ndvi_plot,
    search_sentinel2_items,
)

st.set_page_config(page_title="NDVI — Planetary Computer", layout="wide")


def _parse_geojson_polygon(raw: str) -> dict:
    data = json.loads(raw)
    if data.get("type") != "Polygon":
        raise ValueError("AOI must be a GeoJSON Polygon.")
    return data


def main() -> None:
    st.title("Sentinel-2 NDVI time series")
    st.caption(
        "Microsoft Planetary Computer STAC · (NIR − Red) / (NIR + Red) · "
        "[planetary-computer-apis](https://github.com/microsoft/planetary-computer-apis)"
    )

    c1, c2 = st.columns((1.05, 1.0))
    with c1:
        start = st.date_input("Start", value=date(2024, 1, 1))
        end = st.date_input("End", value=date(2024, 3, 1))
        max_cloud = st.slider("Cloud cover strictly less than (%)", 0, 80, 20, step=5)
        max_items = st.number_input("Max scenes", 1, 80, 20)
        use_dubai = st.checkbox("Dubai demo AOI", value=True)
        raw = st.text_area(
            "GeoJSON Polygon (lon/lat), if custom",
            value=json.dumps(DEFAULT_AOI, indent=2),
            height=180,
            disabled=use_dubai,
        )
    with c2:
        st.info(
            "**NDVI** — `(B08 − B04) / (B08 + B04)` on Sentinel-2 L2A.  "
            "Desert AOIs often fall in 0.1–0.35 except irrigated parcels."
        )

    run = st.button("Run analysis", type="primary")

    if not run:
        return

    try:
        aoi = DEFAULT_AOI if use_dubai else _parse_geojson_polygon(raw)
        ring = aoi["coordinates"][0]
        center_lat, center_lon = aoi_center_latlon(ring)
        aoi_for_clip = create_aoi_from_coords(ring)
    except Exception as e:
        st.error(f"Invalid AOI: {e}")
        return

    with st.spinner("Searching STAC…"):
        try:
            catalog = connect_stac()
            items = search_sentinel2_items(
                catalog,
                aoi,
                start.strftime("%Y-%m-%d"),
                end.strftime("%Y-%m-%d"),
                float(max_cloud),
                max_items=int(max_items),
            )
        except Exception as e:
            st.error(str(e))
            return

    if not items:
        st.warning("No scenes — widen dates or raise cloud threshold.")
        return

    st.success(f"Processing {len(items)} scene(s)…")
    rows = []
    bar = st.progress(0.0)
    for i, item in enumerate(items):
        bar.progress((i + 1) / len(items))
        try:
            nd = calculate_ndvi(item)
            stats = extract_ndvi_stats(nd, aoi_for_clip)
            dt = item.datetime
            if dt is None:
                continue
            rows.append(
                {
                    "date": dt,
                    "date_str": dt.strftime("%Y-%m-%d"),
                    "ndvi_mean": stats["mean"],
                    "ndvi_min": stats["min"],
                    "ndvi_max": stats["max"],
                    "ndvi_std": stats["std"],
                    "ndvi_median": stats["median"],
                    "cloud_cover": float(item.properties.get("eo:cloud_cover", 0) or 0),
                }
            )
        except Exception as ex:
            st.caption(f"Skip {getattr(item, 'id', '?')}: {str(ex)[:100]}")

    bar.empty()
    if not rows:
        st.warning("No successful NDVI extractions.")
        return

    df = pd.DataFrame(rows).sort_values("date")
    st.subheader("Summary")
    mndvi = float(df["ndvi_mean"].mean())
    label, detail = vegetation_health_label(mndvi)
    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Scenes", len(df))
    k2.metric("Mean NDVI", f"{mndvi:.3f}")
    k3.metric("Vegetation class", label)
    k4.metric("Trend max−min", f"{df['ndvi_mean'].max() - df['ndvi_mean'].min():.3f}")
    st.write(detail)

    st.subheader("AOI on map")
    m = create_interactive_map(center_lat, center_lon, aoi)
    components.html(m._repr_html_(), height=420)

    st.subheader("Interactive charts")
    st.plotly_chart(generate_ndvi_plot(df), use_container_width=True)

    st.subheader("Table")
    st.dataframe(
        df[
            [
                "date_str",
                "ndvi_mean",
                "ndvi_min",
                "ndvi_max",
                "ndvi_median",
                "ndvi_std",
                "cloud_cover",
            ]
        ],
        use_container_width=True,
    )

    csv_bytes = export_results(df, "csv").encode("utf-8")
    st.download_button("Download CSV", data=csv_bytes, file_name=f"ndvi_{datetime.now():%Y%m%d_%H%M}.csv", mime="text/csv")


if __name__ == "__main__":
    main()
