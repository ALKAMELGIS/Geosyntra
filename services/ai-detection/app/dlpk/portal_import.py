"""
Import deep-learning packages from ArcGIS Portal item URLs or direct file URLs.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ITEM_ID_RE = re.compile(
    r"(?:/items/|/content/items/|[?&]id=)([0-9a-f]{32})\b",
    re.IGNORECASE,
)

PORTAL_ITEM_REST_RE = re.compile(
    r"^(https?://[^/]+)/sharing/rest/content/items/([0-9a-f]{32})/?",
    re.IGNORECASE,
)

USER_AGENT = "GeoSyntra-AI-Detection/1.0"


def parse_model_source_url(url: str) -> dict[str, str]:
    """Resolve a user URL into download metadata."""
    raw = url.strip()
    if not raw:
        raise ValueError("Model URL is required")

    lowered = raw.lower()
    if lowered.endswith((".dlpk", ".onnx", ".pt", ".pth")):
        name = Path(urllib.parse.urlparse(raw).path).name or "model.dlpk"
        return {"kind": "direct", "download_url": raw, "file_name": name, "item_id": ""}

    m = PORTAL_ITEM_REST_RE.match(raw.rstrip("/"))
    if m:
        portal, item_id = m.group(1), m.group(2)
        return _portal_item_ref(portal, item_id, raw)

    m2 = ITEM_ID_RE.search(raw)
    if m2:
        item_id = m2.group(1)
        parsed = urllib.parse.urlparse(raw)
        portal = f"{parsed.scheme}://{parsed.netloc}" if parsed.netloc else "https://www.arcgis.com"
        return _portal_item_ref(portal, item_id, raw)

    raise ValueError(
        "Unsupported model URL. Use an ArcGIS item link "
        "(…/sharing/rest/content/items/{id}) or a direct .dlpk / .onnx / .pt URL."
    )


def _portal_item_ref(portal: str, item_id: str, source_url: str) -> dict[str, str]:
    portal = portal.rstrip("/")
    meta_url = f"{portal}/sharing/rest/content/items/{item_id}?f=json"
    meta = _fetch_json(meta_url)
    title = str(meta.get("title") or item_id).strip()
    safe = re.sub(r"[^\w.-]+", "-", title).strip("-").lower()[:48] or item_id
    ext = _guess_extension(meta)
    file_name = f"{safe}{ext}"
    download_url = f"{portal}/sharing/rest/content/items/{item_id}/data"
    return {
        "kind": "arcgis_item",
        "portal": portal,
        "item_id": item_id,
        "download_url": download_url,
        "file_name": file_name,
        "title": title,
        "source_url": source_url,
    }


def _guess_extension(meta: dict[str, Any]) -> str:
    name = str(meta.get("name") or "").lower()
    if name.endswith(".dlpk"):
        return ".dlpk"
    if name.endswith(".onnx"):
        return ".onnx"
    if name.endswith((".pt", ".pth")):
        return Path(name).suffix
    type_name = str(meta.get("type") or "").lower()
    keywords = [str(k).lower() for k in (meta.get("typeKeywords") or [])]
    blob = " ".join([type_name, *keywords])
    if "deep learning package" in blob or "dlpk" in blob:
        return ".dlpk"
    if "onnx" in blob:
        return ".onnx"
    return ".dlpk"


def _fetch_json(url: str) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        raise ValueError(f"ArcGIS item metadata failed ({e.code}): {body}") from e
    except urllib.error.URLError as e:
        raise ValueError(f"Could not reach ArcGIS portal: {e.reason}") from e


def download_model_file(download_url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(download_url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()
            cd = resp.headers.get("Content-Disposition") or ""
            if "filename=" in cd and dest.suffix == "":
                part = cd.split("filename=")[-1].strip('"; ')
                if part:
                    dest = dest.with_name(part)
            dest.write_bytes(data)
    except urllib.error.HTTPError as e:
        raise ValueError(f"Model download failed ({e.code})") from e
    except urllib.error.URLError as e:
        raise ValueError(f"Model download failed: {e.reason}") from e

    if dest.stat().st_size < 64:
        raise ValueError("Downloaded file is empty or unavailable (check item sharing).")


def import_model_from_url(url: str, uploads_dir: Path, models_dir: Path) -> dict[str, Any]:
    from .parser import stage_uploaded_model

    ref = parse_model_source_url(url)
    dest = uploads_dir / ref["file_name"]
    if dest.exists():
        dest.unlink()
    download_model_file(ref["download_url"], dest)

    model_id = None
    if ref.get("item_id"):
        model_id = f"arcgis-{ref['item_id']}"

    manifest = stage_uploaded_model(dest, models_dir, model_id=model_id)
    manifest["source_url"] = ref.get("source_url") or url
    if ref.get("item_id"):
        manifest["arcgis_item_id"] = ref["item_id"]
        manifest["arcgis_portal"] = ref.get("portal", "")
    (models_dir / manifest["id"] / "manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    return manifest
