"""Redis-backed job status for async AI detection."""
from __future__ import annotations

import json
import uuid
from typing import Any

import redis

from ..config import settings
from ..schemas import DetectionJobStatus


def _client() -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def _key(job_id: str) -> str:
    return f"ai-detection:job:{job_id}"


def create_job(payload: dict[str, Any]) -> str:
    job_id = str(uuid.uuid4())
    status = DetectionJobStatus(
        job_id=job_id,
        status="queued",
        progress=0.0,
        tiles_done=0,
        tiles_total=0,
        message="Queued for GPU worker",
    )
    data = {**status.model_dump(), "request": payload}
    _client().set(_key(job_id), json.dumps(data), ex=60 * 60 * 48)
    return job_id


def update_job(job_id: str, patch: dict[str, Any]) -> DetectionJobStatus:
    raw = _client().get(_key(job_id))
    if not raw:
        raise KeyError(job_id)
    data = json.loads(raw)
    data.update(patch)
    _client().set(_key(job_id), json.dumps(data), ex=60 * 60 * 48)
    return DetectionJobStatus(**{k: data[k] for k in DetectionJobStatus.model_fields if k in data})


def get_job(job_id: str) -> DetectionJobStatus | None:
    raw = _client().get(_key(job_id))
    if not raw:
        return None
    data = json.loads(raw)
    return DetectionJobStatus(**{k: data[k] for k in DetectionJobStatus.model_fields if k in data})


def list_jobs(limit: int = 50) -> list[DetectionJobStatus]:
    r = _client()
    keys = sorted(r.keys("ai-detection:job:*"))[-limit:]
    out: list[DetectionJobStatus] = []
    for k in keys:
        raw = r.get(k)
        if not raw:
            continue
        data = json.loads(raw)
        out.append(DetectionJobStatus(**{f: data[f] for f in DetectionJobStatus.model_fields if f in data}))
    return list(reversed(out))
