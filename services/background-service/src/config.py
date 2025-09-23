"""Configuration settings for the background service."""

import os
from enum import Enum
from pathlib import Path
from typing import Optional

from pydantic import BaseSettings, Field


class BGEngine(str, Enum):
    """Background generation engine options."""
    SDXL = "sdxl"
    RUNWAY = "runway"


class BGMode(str, Enum):
    """Background cleanup modes."""
    TRANSPARENT = "transparent"
    SOFTEN = "soften"


class Settings(BaseSettings):
    """Application settings."""
    
    # Service configuration
    host: str = Field(default="0.0.0.0", env="HOST")
    port: int = Field(default=8089, env="PORT")
    
    # Background processing
    bg_engine: BGEngine = Field(default=BGEngine.SDXL, env="BG_ENGINE")
    model_id: str = Field(default="stabilityai/stable-diffusion-xl-base-1.0", env="MODEL_ID")
    device: str = Field(default="cpu", env="DEVICE")
    output_dir: Path = Field(default=Path("./media/backgrounds"), env="OUTPUT_DIR")
    
    # API keys
    runway_api_key: Optional[str] = Field(default=None, env="RUNWAY_API_KEY")
    runway_base_url: str = Field(default="https://api.runwayml.com", env="RUNWAY_BASE_URL")
    
    # Generation parameters
    default_steps: int = Field(default=20, env="DEFAULT_STEPS")
    default_guidance_scale: float = Field(default=7.5, env="DEFAULT_GUIDANCE_SCALE")
    default_width: int = Field(default=1024, env="DEFAULT_WIDTH")
    default_height: int = Field(default=1024, env="DEFAULT_HEIGHT")
    
    # Processing parameters
    default_blur_radius: int = Field(default=8, env="DEFAULT_BLUR_RADIUS")
    default_desaturate_pct: int = Field(default=25, env="DEFAULT_DESATURATE_PCT")
    
    # Runway polling
    runway_max_poll_attempts: int = Field(default=60, env="RUNWAY_MAX_POLL_ATTEMPTS")
    runway_poll_interval: int = Field(default=5, env="RUNWAY_POLL_INTERVAL")
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()

# Ensure output directory exists
settings.output_dir.mkdir(parents=True, exist_ok=True)