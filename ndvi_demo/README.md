# NDVI demo — Planetary Computer

Minimal Streamlit app for **Sentinel-2 L2A NDVI** over a GeoJSON polygon, backed by the [Planetary Computer STAC API](https://github.com/microsoft/planetary-computer-apis).

## Run

```bash
cd ndvi_demo
pip install -r requirements.txt
streamlit run app.py
```

## What you get

- STAC search with cloud filter  
- Per-scene NDVI statistics (mean, min, max, median, std) clipped to AOI  
- **Folium** map of the AOI  
- **Plotly** time series + cloud scatter  
- CSV download  

## Frontend

The React **Satellite Imagery → Environmental Index** panel is aligned with the same workflow: Load STAC, draw AOI (polygon / square / circle / point), analytics and map symbology driven by the selected index.
