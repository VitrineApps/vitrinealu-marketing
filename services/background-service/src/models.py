"""Pydantic models for request/response DTOs."""

from typing import Optional, Dict, Any
from pathlib import Path
from pydantic import BaseModel, Field, validator

from .config import BGEngine, BGMode


class CleanupRequest(BaseModel):
    """Request model for background cleanup."""
    
    image_path: str = Field(..., description="Path to the input image")
    mode: BGMode = Field(default=BGMode.TRANSPARENT, description="Cleanup mode")
    blur_radius: int = Field(default=8, ge=1, le=50, description="Blur radius for soften mode")
    desaturate_pct: int = Field(default=25, ge=0, le=100, description="Desaturation percentage")
    
    @validator('image_path')
    def validate_image_path(cls, v):
        """Validate that the image path exists."""
        path = Path(v)
        if not path.exists():
            raise ValueError(f"Image path does not exist: {v}")
        if not path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
            raise ValueError(f"Unsupported image format: {path.suffix}")
        return v


class ReplaceRequest(BaseModel):
    """Request model for background replacement."""
    
    image_path: str = Field(..., description="Path to the input image")
    prompt: str = Field(..., min_length=3, max_length=500, description="Generation prompt")
    negative_prompt: Optional[str] = Field(default="people, text, watermark", description="Negative prompt")
    seed: Optional[int] = Field(default=42, description="Random seed for generation")
    engine: BGEngine = Field(default=BGEngine.SDXL, description="Generation engine")
    
    # SDXL specific parameters
    steps: Optional[int] = Field(default=20, ge=1, le=100, description="Number of inference steps")
    guidance_scale: Optional[float] = Field(default=7.5, ge=1.0, le=20.0, description="Guidance scale")
    width: Optional[int] = Field(default=1024, ge=512, le=2048, description="Output width")
    height: Optional[int] = Field(default=1024, ge=512, le=2048, description="Output height")
    
    @validator('image_path')
    def validate_image_path(cls, v):
        """Validate that the image path exists."""
        path = Path(v)
        if not path.exists():
            raise ValueError(f"Image path does not exist: {v}")
        if not path.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp', '.tiff']:
            raise ValueError(f"Unsupported image format: {path.suffix}")
        return v
    
    @validator('width', 'height')
    def validate_dimensions(cls, v):
        """Ensure dimensions are multiples of 8 for SDXL."""
        if v % 8 != 0:
            raise ValueError(f"Dimensions must be multiples of 8, got {v}")
        return v


class ProcessingResponse(BaseModel):
    """Response model for both cleanup and replacement operations."""
    
    success: bool = Field(..., description="Whether the operation was successful")
    message: str = Field(..., description="Status message")
    
    # Output files
    out_png: Optional[str] = Field(None, description="Path to PNG output with transparency")
    out_jpg: Optional[str] = Field(None, description="Path to JPG output")
    mask_path: Optional[str] = Field(None, description="Path to the foreground mask")
    
    # Metadata
    meta: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    
    # Processing info
    processing_time: Optional[float] = Field(None, description="Processing time in seconds")
    engine_used: Optional[str] = Field(None, description="Engine used for generation")


class HealthResponse(BaseModel):
    """Health check response."""
    
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="Service version")
    engines_available: Dict[str, bool] = Field(..., description="Available engines")
    device: str = Field(..., description="Compute device")


class ErrorResponse(BaseModel):
    """Error response model."""
    
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")