from typing import Any, Literal

from pydantic import BaseModel, Field


class ModelParameters(BaseModel):
    threshold: float = 0.25
    nms_overlap: float = 0.1
    padding: int = 32
    batch_size: int = 4
    test_time_augmentation: bool = False
    exclude_pad_detections: bool = True


class DetectionJobCreate(BaseModel):
    imagery_source: str = Field(..., description="Layer id, WMS id, or uploaded raster path")
    imagery_type: Literal["wms", "upload", "layer"] = "upload"
    model_id: str | None = None
    aoi_geojson: dict[str, Any] | None = None
    use_gpu: bool = True
    gpu_device: str = "0"
    tile_size: int = 512
    parallel_factor: str | None = None
    mask_layer_id: str | None = None
    cell_size_mode: str | None = None
    cell_size_value: str | None = None
    extent_source: str | None = None
    params: ModelParameters = Field(default_factory=ModelParameters)


class DetectionJobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "completed", "failed", "cancelled"]
    progress: float = 0.0
    tiles_done: int = 0
    tiles_total: int = 0
    gpu_usage_pct: float | None = None
    eta_seconds: int | None = None
    message: str = ""
    result_geojson: dict[str, Any] | None = None
    error: str | None = None


class ModelImportUrl(BaseModel):
    url: str = Field(
        ...,
        description="ArcGIS Portal item URL or direct .dlpk / .onnx / .pt download link",
    )


class ModelInputSize(BaseModel):
    width: int
    height: int


class ModelInfo(BaseModel):
    id: str
    name: str
    framework: str
    model_type: str
    file_name: str
    created_at: str
    kind: str = "unknown"
    classes: list[str] = Field(default_factory=list)
    input_size: ModelInputSize | None = None
    gpu_required: bool = True
    validated: bool = True
    validation_errors: list[str] = Field(default_factory=list)
    source_url: str | None = None
