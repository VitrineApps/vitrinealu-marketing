"""Brand configuration loader with validation."""

import yaml
from pathlib import Path
from typing import Dict, Any
from pydantic import BaseModel, Field, validator


class BrandColors(BaseModel):
    """Brand color palette."""
    primary: str = Field(..., description="Primary brand color (hex)")
    secondary: str = Field(..., description="Secondary brand color (hex)")
    accent: str = Field(..., description="Accent color (hex)")
    text_light: str = Field(..., description="Light text color (hex)")
    text_dark: str = Field(..., description="Dark text color (hex)")


class BrandFonts(BaseModel):
    """Brand typography."""
    primary: str = Field(..., description="Primary font family")
    secondary: str = Field(..., description="Secondary font family")


class BrandWatermark(BaseModel):
    """Watermark configuration."""
    path: str = Field(..., description="Path to watermark image file")
    opacity: float = Field(..., ge=0.0, le=1.0, description="Watermark opacity (0.0-1.0)")
    margin_px: int = Field(..., gt=0, description="Margin around watermark in pixels")


class BrandAspectRatios(BaseModel):
    """Content aspect ratios."""
    reels: str = Field(..., description="Reels aspect ratio (e.g., '9:16')")
    square: str = Field(..., description="Square aspect ratio (e.g., '1:1')")
    landscape: str = Field(..., description="Landscape aspect ratio (e.g., '16:9')")


class BrandSafeAreas(BaseModel):
    """Safe areas for content placement."""
    class ReelsSafeArea(BaseModel):
        """Safe area configuration for reels."""
        top: int = Field(..., ge=0, description="Top safe area margin in pixels")
        bottom: int = Field(..., ge=0, description="Bottom safe area margin in pixels")
        left: int = Field(..., ge=0, description="Left safe area margin in pixels")
        right: int = Field(..., ge=0, description="Right safe area margin in pixels")

    reels: ReelsSafeArea = Field(..., description="Safe areas for reels content")


class BrandConfig(BaseModel):
    """Complete brand configuration."""
    brand: str = Field(..., description="Brand name")
    tagline: str = Field(..., description="Brand tagline")
    colors: BrandColors = Field(..., description="Brand color palette")
    fonts: BrandFonts = Field(..., description="Brand typography")
    watermark: BrandWatermark = Field(..., description="Watermark configuration")
    aspect_ratios: BrandAspectRatios = Field(..., description="Content aspect ratios")
    safe_areas: BrandSafeAreas = Field(..., description="Safe areas for content")

    @validator('brand')
    def brand_must_not_be_empty(cls, v):
        if not v.strip():
            raise ValueError('Brand name cannot be empty')
        return v.strip()

    @validator('tagline')
    def tagline_must_not_be_empty(cls, v):
        if not v.strip():
            raise ValueError('Tagline cannot be empty')
        return v.strip()


def load_brand_config(config_path: Path = None) -> BrandConfig:
    """
    Load brand configuration from YAML file.

    Args:
        config_path: Path to the brand.yaml file. Defaults to config/brand.yaml relative to cwd.

    Returns:
        Validated BrandConfig object.

    Raises:
        FileNotFoundError: If the config file doesn't exist.
        yaml.YAMLError: If the YAML is malformed.
        ValidationError: If the config doesn't match the expected schema.
    """
    if config_path is None:
        config_path = Path.cwd() / "config" / "brand.yaml"

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"Brand config file not found: {config_path}")
    except yaml.YAMLError as e:
        raise yaml.YAMLError(f"Invalid YAML in brand config: {e}")

    return BrandConfig(**data)


def get_default_brand_config() -> BrandConfig:
    """
    Get the default brand configuration.

    Returns:
        The default brand configuration loaded from config/brand.yaml.
    """
    return load_brand_config()