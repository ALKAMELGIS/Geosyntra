from __future__ import annotations

from pathlib import Path

from .celery_app import celery_app
from ..config import settings
from ..inference.pipeline import load_manifest, run_detection_pipeline
from ..services.job_store import update_job


@celery_app.task(name="ai_detection.run_job", bind=True)
def run_detection_job(self, job_id: str, request: dict) -> dict:
    def progress(patch: dict) -> None:
        update_job(job_id, patch)

    try:
        update_job(job_id, {"status": "running", "message": "Loading model…"})
        manifest = None
        model_id = request.get("model_id")
        if model_id:
            manifest = load_manifest(Path(settings.storage_dir) / "models", model_id)

        params = request.get("params") or {}
        fc = run_detection_pipeline(
            manifest=manifest,
            raster_width=int(request.get("raster_width") or 4096),
            raster_height=int(request.get("raster_height") or 4096),
            tile_size=int(request.get("tile_size") or settings.default_tile_size),
            padding=int(params.get("padding") or settings.default_padding),
            batch_size=int(params.get("batch_size") or settings.default_batch_size),
            threshold=float(params.get("threshold") or 0.25),
            nms_overlap=float(params.get("nms_overlap") or 0.1),
            exclude_pad_detections=bool(params.get("exclude_pad_detections", True)),
            use_gpu=bool(request.get("use_gpu", True)),
            progress=progress,
        )
        update_job(
            job_id,
            {
                "status": "completed",
                "progress": 100.0,
                "result_geojson": fc,
                "message": f"Published {len(fc.get('features', []))} detections",
            },
        )
        return {"ok": True, "features": len(fc.get("features", []))}
    except Exception as e:
        update_job(job_id, {"status": "failed", "error": str(e), "message": "Job failed"})
        raise
