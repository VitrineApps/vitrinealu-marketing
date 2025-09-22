"""Configuration settings for Media Ingest Service"""

from pathlib import Path
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class MediaIngestConfig(BaseSettings):
    """Configuration for the Media Ingest service using Pydantic settings."""

    # Google Drive settings
    google_creds_path: str = Field(..., description="Path to Google service account credentials JSON")

    # NAS settings
    nas_paths: List[str] = Field(..., description="List of NAS root paths to watch")

    # Output settings
    output_base_path: str = Field("/media/curated", description="Base path for curated outputs")
    temp_dir: str = Field("/tmp/media_ingest", description="Temporary directory for processing")

    # Processing settings
    concurrency: int = Field(4, description="Number of concurrent workers")
    max_file_size_mb: int = Field(100, description="Maximum file size to process in MB")

    # Curation thresholds
    aesthetic_threshold: float = Field(0.5, description="Minimum aesthetic score to keep")
    sharpness_threshold: float = Field(100.0, description="Minimum sharpness score")
    duplicate_hamming_threshold: int = Field(5, description="Hamming distance threshold for duplicate detection")

    # Brand settings
    brand_kit_path: str = Field(..., description="Path to brand kit YAML file")
    watermark_path: Optional[str] = Field(None, description="Path to watermark image")

    # Feature toggles
    face_blur_enabled: bool = Field(True, description="Enable face blurring")
    enhancement_enabled: bool = Field(True, description="Enable image enhancement")

    # Enhancement settings
    enhancement_backend: str = Field("realesrgan", description="Enhancement backend: realesrgan, gfpgan, or pil")
    enhancement_scale: int = Field(2, description="Enhancement scale factor")

    # Logging
    log_level: str = Field("INFO", description="Logging level")
    log_file: str = Field("logs/media_ingest.log", description="Log file path")

    # Database
    processed_db_path: str = Field("state/processed.sqlite", description="Path to processed files database")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MEDIA_INGEST_",
        case_sensitive=False,
    )


# Global config instance
config = MediaIngestConfig()