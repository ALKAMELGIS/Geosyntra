# GeoSyntra AI Detection Service

Enterprise deep-learning inference for web GIS (ArcGIS-style `.dlpk` packages without arcpy).

## Stack

- **FastAPI** — REST + WebSocket job progress
- **Celery + Redis** — async GPU workers
- **PyTorch / ONNX Runtime** — inference (CUDA when available)
- **Rasterio / GDAL** — tiled raster processing

## Quick start

```bash
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build
```

API: `http://localhost:8095/health`

Frontend env:

```env
VITE_AI_DETECTION_API_URL=http://localhost:8095
```

## Workflow

1. Upload `.dlpk`, `.onnx`, `.pt`, or `.pth` model
2. Create detection job with imagery + AOI + parameters
3. Worker tiles raster (512×512, padding 32), runs inference, NMS, merges GeoJSON
4. Publish FeatureCollection to map layer

## PostGIS

Run `app/db/migrations/001_ai_detection.sql` on `agri_cloud`.

## Esri reference

Model training ecosystem: [Esri/deep-learning-frameworks](https://github.com/Esri/deep-learning-frameworks)
