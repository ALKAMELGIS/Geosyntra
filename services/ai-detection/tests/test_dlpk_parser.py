import json
import zipfile
from pathlib import Path

import pytest

from app.dlpk.metadata import extract_classes_from_emd, extract_input_size_from_emd
from app.dlpk.parser import parse_dlpk, validate_dlpk_file


def _make_dlpk(tmp_path: Path, emd: dict, extra_files: dict[str, bytes] | None = None) -> Path:
    dlpk = tmp_path / "test.dlpk"
    with zipfile.ZipFile(dlpk, "w") as zf:
        zf.writestr("esri_model_definition.emd", json.dumps(emd))
        zf.writestr("model.pth", b"fake-weights")
        for name, data in (extra_files or {}).items():
            zf.writestr(name, data)
    return dlpk


def test_validate_rejects_non_zip(tmp_path: Path) -> None:
    bad = tmp_path / "bad.dlpk"
    bad.write_text("not a zip")
    errors = validate_dlpk_file(bad)
    assert any("ZIP" in e or "archive" in e for e in errors)


def test_parse_dlpk_extracts_metadata(tmp_path: Path) -> None:
    emd = {
        "ModelName": "TreeDetector",
        "Framework": "PyTorch",
        "ModelType": "ObjectDetection",
        "ImageWidth": 512,
        "ImageHeight": 512,
        "Classes": ["Tree", "Shrub"],
    }
    dlpk = _make_dlpk(tmp_path, emd)
    manifest = parse_dlpk(dlpk, tmp_path / "out")
    assert manifest.name == "TreeDetector"
    assert manifest.framework == "pytorch"
    assert manifest.classes == ["Tree", "Shrub"]
    assert manifest.input_size == {"width": 512, "height": 512}
    assert manifest.gpu_required is True


def test_extract_classes_from_emd_dict() -> None:
    emd = {"ClassNames": {"0": "Building", "1": "Road"}}
    assert extract_classes_from_emd(emd) == ["Building", "Road"]


def test_extract_input_size_patch_list() -> None:
    emd = {"PatchSize": [416, 416]}
    assert extract_input_size_from_emd(emd) == {"width": 416, "height": 416}
