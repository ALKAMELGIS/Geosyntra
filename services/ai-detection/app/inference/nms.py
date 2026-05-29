"""Non-maximum suppression for detection boxes."""
from __future__ import annotations

from typing import Any


def iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter = max(0.0, inter_x2 - inter_x1) * max(0.0, inter_y2 - inter_y1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def nms(detections: list[dict[str, Any]], overlap: float = 0.1) -> list[dict[str, Any]]:
    ordered = sorted(detections, key=lambda d: float(d.get("confidence", 0)), reverse=True)
    kept: list[dict[str, Any]] = []
    for det in ordered:
        box = det.get("bbox")
        if not isinstance(box, list) or len(box) != 4:
            continue
        suppress = False
        for k in kept:
            kb = k.get("bbox")
            if isinstance(kb, list) and len(kb) == 4 and iou(box, kb) > overlap:
                suppress = True
                break
        if not suppress:
            kept.append(det)
    return kept
