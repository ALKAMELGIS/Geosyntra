from celery import Celery

from ..config import settings

celery_app = Celery(
    "geosyntra_ai_detection",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

celery_app.autodiscover_tasks(["app.workers"])
# Ensure task module is registered when worker starts.
from . import tasks as _tasks  # noqa: F401
