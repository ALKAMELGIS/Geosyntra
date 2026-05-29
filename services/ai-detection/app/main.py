"""
GeoSyntra AI Detection API — FastAPI gateway for DLPK / ONNX / PyTorch inference jobs.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .dlpk.parser import manifest_to_model_info, stage_uploaded_model
from .dlpk.portal_import import import_model_from_url
from .schemas import DetectionJobCreate, DetectionJobStatus, ModelImportUrl, ModelInfo
from .services.job_store import create_job, get_job, list_jobs
from .workers.tasks import run_detection_job

app = FastAPI(title="GeoSyntra AI Detection", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE = Path(settings.storage_dir)
MODELS_DIR = STORAGE / "models"
UPLOADS_DIR = STORAGE / "uploads"
for d in (STORAGE, MODELS_DIR, UPLOADS_DIR):
    d.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict[str, Any]:
    gpu = False
    try:
        import torch

        gpu = torch.cuda.is_available()
    except ImportError:
        pass
    return {
        "ok": True,
        "service": "geosyntra-ai-detection",
        "gpu_available": gpu,
        "storage": str(STORAGE),
    }


def _load_manifest_model(path: Path) -> ModelInfo | None:
    manifest_path = path / "manifest.json"
    if not manifest_path.is_file():
        return None
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    return ModelInfo(**manifest_to_model_info(data))


@app.get("/api/v1/ai/models", response_model=list[ModelInfo])
def list_models() -> list[ModelInfo]:
    out: list[ModelInfo] = []
    for path in sorted(MODELS_DIR.iterdir()):
        info = _load_manifest_model(path)
        if info:
            out.append(info)
    return out


@app.get("/api/v1/ai/models/{model_id}", response_model=ModelInfo)
def get_model(model_id: str) -> ModelInfo:
    info = _load_manifest_model(MODELS_DIR / model_id)
    if not info:
        from fastapi import HTTPException

        raise HTTPException(404, "Model not found")
    return info


@app.post("/api/v1/ai/models/upload", response_model=ModelInfo)
async def upload_model(file: UploadFile = File(...)) -> ModelInfo:
    from fastapi import HTTPException

    filename = file.filename or "model.dlpk"
    dest = UPLOADS_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    try:
        manifest = stage_uploaded_model(dest, MODELS_DIR)
    except ValueError as e:
        if dest.is_file():
            dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ModelInfo(**manifest_to_model_info(manifest))


@app.post("/api/v1/ai/models/import-url", response_model=ModelInfo)
def import_model_url(body: ModelImportUrl) -> ModelInfo:
    from fastapi import HTTPException

    try:
        manifest = import_model_from_url(body.url.strip(), UPLOADS_DIR, MODELS_DIR)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ModelInfo(**manifest_to_model_info(manifest))


@app.post("/api/v1/ai/jobs", response_model=DetectionJobStatus)
def create_detection_job(body: DetectionJobCreate) -> DetectionJobStatus:
    payload = body.model_dump()
    payload["raster_width"] = 4096
    payload["raster_height"] = 4096
    job_id = create_job(payload)
    run_detection_job.delay(job_id, payload)
    status = get_job(job_id)
    assert status
    return status


@app.get("/api/v1/ai/jobs", response_model=list[DetectionJobStatus])
def jobs_history() -> list[DetectionJobStatus]:
    return list_jobs()


@app.get("/api/v1/ai/jobs/{job_id}", response_model=DetectionJobStatus)
def job_status(job_id: str) -> DetectionJobStatus:
    status = get_job(job_id)
    if not status:
        from fastapi import HTTPException

        raise HTTPException(404, "Job not found")
    return status


@app.websocket("/ws/ai/jobs/{job_id}")
async def job_ws(websocket: WebSocket, job_id: str) -> None:
    import asyncio

    await websocket.accept()
    try:
        while True:
            status = get_job(job_id)
            if status:
                await websocket.send_json(status.model_dump())
                if status.status in ("completed", "failed", "cancelled"):
                    break
            await asyncio.sleep(0.45)
    except WebSocketDisconnect:
        return
