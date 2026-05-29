"""
Extract ArcGIS EMD / package metadata for model registry and UI.
"""
from __future__ import annotations

from typing import Any


def _as_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        n = int(float(v))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _normalize_classes(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, dict):
        out: list[str] = []
        for k in sorted(raw.keys(), key=lambda x: str(x)):
            label = raw[k]
            if isinstance(label, str) and label.strip():
                out.append(label.strip())
            elif label is not None:
                out.append(str(label).strip())
        return [c for c in out if c]
    if isinstance(raw, (list, tuple)):
        out = []
        for item in raw:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
            elif isinstance(item, dict):
                name = item.get("name") or item.get("Name") or item.get("label")
                if name:
                    out.append(str(name).strip())
            elif item is not None:
                out.append(str(item).strip())
        return [c for c in out if c]
    if isinstance(raw, str) and raw.strip():
        return [p.strip() for p in raw.replace(";", ",").split(",") if p.strip()]
    return []


def extract_classes_from_emd(emd: dict[str, Any]) -> list[str]:
    for key in (
        "Classes",
        "ClassNames",
        "class_names",
        "classes",
        "Labels",
        "labels",
        "CategoryNames",
    ):
        found = _normalize_classes(emd.get(key))
        if found:
            return found
    cfg = emd.get("ModelConfiguration") or emd.get("model_configuration")
    if isinstance(cfg, dict):
        for key in ("AllTilesStats", "Classes", "ClassNames"):
            found = _normalize_classes(cfg.get(key))
            if found:
                return found
    return []


def extract_input_size_from_emd(emd: dict[str, Any]) -> dict[str, int] | None:
    w = _as_int(emd.get("ImageWidth") or emd.get("image_width") or emd.get("width"))
    h = _as_int(emd.get("ImageHeight") or emd.get("image_height") or emd.get("height"))
    if w and h:
        return {"width": w, "height": h}

    patch = emd.get("PatchSize") or emd.get("patch_size") or emd.get("InputSize")
    if isinstance(patch, (list, tuple)) and len(patch) >= 2:
        w2, h2 = _as_int(patch[0]), _as_int(patch[1])
        if w2 and h2:
            return {"width": w2, "height": h2}
    if isinstance(patch, dict):
        w2 = _as_int(patch.get("width") or patch.get("Width"))
        h2 = _as_int(patch.get("height") or patch.get("Height"))
        if w2 and h2:
            return {"width": w2, "height": h2}

    cfg = emd.get("ModelConfiguration") or emd.get("model_configuration")
    if isinstance(cfg, dict):
        for key in ("ImageWidth", "ImageHeight", "CropSize", "InputSize"):
            if key in cfg and isinstance(cfg[key], (int, float, str)):
                if "width" in key.lower() or key == "ImageWidth":
                    w = _as_int(cfg[key])
                elif "height" in key.lower() or key == "ImageHeight":
                    h = _as_int(cfg[key])
        if w and h:
            return {"width": w, "height": h}
    return None


def infer_gpu_required(framework: str, emd: dict[str, Any], model_type: str) -> bool:
    explicit = emd.get("GpuRequired") or emd.get("gpu_required") or emd.get("RequiresGPU")
    if explicit is not None:
        return bool(explicit)
    fw = framework.lower()
    if fw in {"onnx", "tensorflow", "pytorch", "torch"}:
        return True
    if model_type.lower() in {"objectdetection", "pixelclassification", "instance segmentation"}:
        return True
    return False


def build_model_metadata(
    *,
    kind: str,
    name: str,
    framework: str,
    model_type: str,
    emd: dict[str, Any] | None = None,
    file_name: str = "",
) -> dict[str, Any]:
    emd = emd or {}
    classes = extract_classes_from_emd(emd) if emd else []
    input_size = extract_input_size_from_emd(emd) if emd else None
    gpu_required = infer_gpu_required(framework, emd, model_type)
    return {
        "kind": kind,
        "name": name,
        "framework": framework,
        "model_type": model_type,
        "file_name": file_name,
        "classes": classes,
        "input_size": input_size,
        "gpu_required": gpu_required,
        "validated": True,
        "validation_errors": [],
    }
