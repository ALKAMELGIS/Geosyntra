from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    api_host: str = "0.0.0.0"
    api_port: int = 8095
    redis_url: str = "redis://redis:6379/0"
    database_url: str = "postgresql://user:password@db:5432/agri_cloud"
    storage_dir: str = "/data/ai-detection"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/1"
    default_tile_size: int = 512
    default_padding: int = 32
    default_batch_size: int = 4
    cuda_device: str = "0"
    enable_gpu: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
