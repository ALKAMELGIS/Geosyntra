"""
Parse ArcGIS Deep Learning Package (.dlpk) without arcpy.

.dlpk files are ZIP archives containing esri_model_definition.emd and weights.
"""
from __future__ import annotations

import json
import shutil
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .metadata import build_model_metadata, extract_classes_from_emd, extract_input_size_from_emd, infer_gpu_required


@dataclass
class DlpkManifest:
    name: str
    framework: str
    model_type: str
    emd: dict[str, Any]
    extract_dir: Path
    weights_path: Path | None
    onnx_path: Path | None
    classes: list[str] = field(default_factory=list)
    input_size: dict[str, int] | None = None
    gpu_required: bool = True
    validation_errors: list[str] = field(default_factory=list)


def _find_file(root: Path, names: tuple[str, ...]) -> Path | None:
    for name in names:
        direct = root / name
        if direct.is_file():
            return direct
    for p in root.rglob("*"):
        if p.is_file() and p.name.lower() in {n.lower() for n in names}:
            return p
    return None


def validate_dlpk_file(dlpk_path: Path) -> list[str]:
    """Pre-flight checks before extraction."""
    errors: list[str] = []
    if not dlpk_path.is_file():
        return ["File not found"]
    if dlpk_path.suffix.lower() != ".dlpk":
        errors.append("Expected a .dlpk file (ArcGIS Deep Learning Package)")
    if dlpk_path.stat().st_size < 1024:
        errors.append("File is too small to be a valid deep learning package")
    try:
        with zipfile.ZipFile(dlpk_path, "r") as zf:
            if zf.testzip() is not None:
                errors.append("ZIP archive is corrupt")
            names = {n.lower() for n in zf.namelist()}
            if not any("esri_model_definition.emd" in n or n.endswith("model.emd") for n in names):
                errors.append("Missing esri_model_definition.emd inside package")
    except zipfile.BadZipFile:
        errors.append("Not a valid ZIP / .dlpk archive")
    return errors


def parse_dlpk(dlpk_path: Path, dest_dir: Path) -> DlpkManifest:
    """Validate, extract, and parse .dlpk metadata (full pipeline step)."""
    errors = validate_dlpk_file(dlpk_path)
    if errors:
        raise ValueError("; ".join(errors))
    return extract_dlpk(dlpk_path, dest_dir)


def extract_dlpk(dlpk_path: Path, dest_dir: Path) -> DlpkManifest:
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dlpk_path, "r") as zf:
        zf.extractall(dest_dir)

    emd_path = _find_file(
        dest_dir,
        (
            "esri_model_definition.emd",
            "model.emd",
            "EsriModelDefinition.emd",
        ),
    )
    if not emd_path:
        raise ValueError("esri_model_definition.emd not found in .dlpk package")

    emd = json.loads(emd_path.read_text(encoding="utf-8"))
    framework = str(emd.get("Framework") or emd.get("framework") or "pytorch").lower()
    model_type = str(emd.get("ModelType") or emd.get("model_type") or "ObjectDetection").strip()
    name = str(emd.get("ModelName") or emd.get("name") or dlpk_path.stem)

    weights = _find_file(
        dest_dir,
        ("model.pth", "weights.pth", "best_model.pth", "model.pt", "yolov8.pt"),
    )
    onnx = _find_file(dest_dir, ("model.onnx", "inference.onnx"))
    classes = extract_classes_from_emd(emd)
    input_size = extract_input_size_from_emd(emd)
    gpu_required = infer_gpu_required(framework, emd, model_type)
    validation_errors: list[str] = []
    if not weights and not onnx:
        validation_errors.append("No model weights (.pth/.pt) or ONNX file found in package")

    return DlpkManifest(
        name=name,
        framework=framework,
        model_type=model_type,
        emd=emd,
        extract_dir=dest_dir,
        weights_path=weights,
        onnx_path=onnx,
        classes=classes,
        input_size=input_size,
        gpu_required=gpu_required,
        validation_errors=validation_errors,
    )


def detect_package_kind(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".dlpk":
        return "dlpk"
    if ext == ".onnx":
        return "onnx"
    if ext in {".pt", ".pth"}:
        return "pytorch"
    return "unknown"


def stage_uploaded_model(
    upload_path: Path,
    models_dir: Path,
    *,
    model_id: str | None = None,
) -> dict[str, Any]:
    """Store uploaded model and return registry metadata."""
    kind = detect_package_kind(upload_path.name)
    model_id = (model_id or upload_path.stem).replace(" ", "-").lower()[:64]
    target = models_dir / model_id
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)

    from datetime import datetime, timezone

    manifest: dict[str, Any] = {
        "id": model_id,
        "file_name": upload_path.name,
        "kind": kind,
        "framework": "unknown",
        "model_type": "Unknown",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if kind == "unknown":
        raise ValueError(
            f"Unsupported model file '{upload_path.name}'. Use .dlpk, .onnx, .pt, or .pth."
        )

    if kind == "dlpk":
        shutil.copy2(upload_path, target / upload_path.name)
        dlpk = parse_dlpk(upload_path, target / "extracted")
        meta = build_model_metadata(
            kind="dlpk",
            name=dlpk.name,
            framework=dlpk.framework,
            model_type=dlpk.model_type,
            emd=dlpk.emd,
            file_name=upload_path.name,
        )
        manifest.update(meta)
        manifest.update(
            {
                "emd_path": str(_find_file(dlpk.extract_dir, ("esri_model_definition.emd",)) or ""),
                "weights_path": str(dlpk.weights_path) if dlpk.weights_path else None,
                "onnx_path": str(dlpk.onnx_path) if dlpk.onnx_path else None,
                "package_path": str(target / upload_path.name),
            }
        )
        if dlpk.validation_errors:
            manifest["validation_errors"] = dlpk.validation_errors
            manifest["validated"] = False
        (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    staged = target / upload_path.name
    shutil.copy2(upload_path, staged)
    if kind == "onnx":
        meta = build_model_metadata(
            kind="onnx",
            name=upload_path.stem,
            framework="onnx",
            model_type="ObjectDetection",
            file_name=upload_path.name,
        )
        manifest.update(meta)
        manifest["onnx_path"] = str(staged)
    elif kind == "pytorch":
        meta = build_model_metadata(
            kind="pytorch",
            name=upload_path.stem,
            framework="pytorch",
            model_type="ObjectDetection",
            file_name=upload_path.name,
        )
        manifest.update(meta)
        manifest["weights_path"] = str(staged)
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def manifest_to_model_info(data: dict[str, Any]) -> dict[str, Any]:
    """API-facing model record from stored manifest.json."""
    return {
        "id": data.get("id", ""),
        "name": data.get("name", data.get("id", "")),
        "framework": str(data.get("framework", "unknown")),
        "model_type": str(data.get("model_type", "Unknown")),
        "file_name": str(data.get("file_name", "")),
        "created_at": str(data.get("created_at", "")),
        "kind": str(data.get("kind", "unknown")),
        "classes": list(data.get("classes") or []),
        "input_size": data.get("input_size"),
        "gpu_required": bool(data.get("gpu_required", True)),
        "validated": bool(data.get("validated", True)),
        "validation_errors": list(data.get("validation_errors") or []),
        "source_url": data.get("source_url"),
    }
