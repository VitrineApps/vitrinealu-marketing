"""Watermark application for images"""

from pathlib import Path
from typing import Optional

from PIL import Image

from .brand_loader import get_default_brand_config


class WatermarkApplier:
    """Applies watermark overlay to images"""

    def __init__(self, watermark_path: Optional[str] = None):
        if watermark_path:
            self.watermark_path = watermark_path
        else:
            # Load from brand config
            brand_config = get_default_brand_config()
            self.watermark_path = brand_config.watermark.path

        self.watermark: Optional[Image.Image] = None
        self.opacity = 0.85  # Default from brand config
        self.margin_px = 48  # Default from brand config

        # Load brand config for watermark settings
        try:
            brand_config = get_default_brand_config()
            self.opacity = brand_config.watermark.opacity
            self.margin_px = brand_config.watermark.margin_px
        except Exception:
            # Fall back to defaults if brand config fails to load
            pass

        if self.watermark_path and Path(self.watermark_path).exists():
            self.watermark = Image.open(self.watermark_path).convert("RGBA")
        else:
            print(f"Warning: Watermark not found at {self.watermark_path}")

    def apply_watermark(self, image: Image.Image, opacity: Optional[float] = None, margin_px: Optional[int] = None) -> Image.Image:
        """Apply watermark to image with scaling and positioning"""
        if not self.watermark:
            return image

        # Use provided values or fall back to instance defaults
        wm_opacity = opacity if opacity is not None else self.opacity
        wm_margin = margin_px if margin_px is not None else self.margin_px

        # Convert image to RGBA for compositing
        image_rgba = image.convert("RGBA")

        # Calculate watermark size based on image dimensions
        img_w, img_h = image_rgba.size
        wm_w, wm_h = self.watermark.size

        # Scale watermark to fit (e.g., 15% of image width, respecting aspect ratio)
        target_width = int(img_w * 0.15)
        scale = target_width / wm_w
        new_wm_w = target_width
        new_wm_h = int(wm_h * scale)

        # Resize watermark
        watermark_resized = self.watermark.resize((new_wm_w, new_wm_h), Image.LANCZOS)

        # Apply opacity
        if wm_opacity < 1.0:
            alpha = watermark_resized.split()[-1]  # Get alpha channel
            alpha = alpha.point(lambda p: p * wm_opacity)  # Apply opacity
            watermark_resized.putalpha(alpha)

        # Position: bottom-right with margin
        margin_x = wm_margin
        margin_y = wm_margin
        position = (img_w - new_wm_w - margin_x, img_h - new_wm_h - margin_y)

        # Composite watermark onto image
        image_rgba.paste(watermark_resized, position, watermark_resized)

        return image_rgba.convert("RGB")


# Global watermark applier instance
watermark_applier = WatermarkApplier()