"""Image enhancement engine with multiple backends"""

import cv2
import torch
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

try:
    from realesrgan import RealESRGANer
    REALESRGAN_AVAILABLE = True
except ImportError:
    REALESRGAN_AVAILABLE = False

try:
    from gfpgan import GFPGANer
    GFPGAN_AVAILABLE = True
except ImportError:
    GFPGAN_AVAILABLE = False

try:
    from rembg import remove
    REMBG_AVAILABLE = True
except ImportError:
    REMBG_AVAILABLE = False

from .config import config


class ImageEnhancer:
    """Image enhancement with multiple backend support"""

    def __init__(self, backend: Optional[str] = None, scale: Optional[int] = None):
        self.backend = backend or config.enhancement_backend
        self.scale = scale or config.enhancement_scale

        self.model = None
        self._load_model()

    def _load_model(self):
        """Load the appropriate enhancement model"""
        if self.backend == 'realesrgan' and REALESRGAN_AVAILABLE:
            # RealESRGAN model loading (simplified)
            try:
                self.model = RealESRGANer(
                    scale=self.scale,
                    model_path=None,  # Would need actual model file
                    device='cuda' if torch.cuda.is_available() else 'cpu'
                )
            except Exception as e:
                print(f"Failed to load RealESRGAN: {e}")
                self.model = None

        elif self.backend == 'gfpgan' and GFPGAN_AVAILABLE:
            try:
                self.model = GFPGANer(
                    model_path=None,  # Would need actual model file
                    upscale=self.scale,
                    device='cuda' if torch.cuda.is_available() else 'cpu'
                )
            except Exception as e:
                print(f"Failed to load GFPGAN: {e}")
                self.model = None

        else:
            print(f"Using PIL fallback for backend: {self.backend}")
            self.model = None

    def enhance(self, image: Image.Image) -> Image.Image:
        """Enhance an image using the configured backend"""
        if not config.enhancement_enabled:
            return image

        try:
            if self.model and self.backend == 'realesrgan':
                # Convert PIL to numpy
                img_np = np.array(image)
                # RealESRGAN expects BGR
                img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
                enhanced_bgr, _ = self.model.enhance(img_bgr)
                enhanced_rgb = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2RGB)
                return Image.fromarray(enhanced_rgb)

            elif self.model and self.backend == 'gfpgan':
                # GFPGAN enhancement
                img_np = np.array(image)
                _, _, enhanced_np = self.model.enhance(
                    img_np, has_aligned=False, only_center_face=False
                )
                return Image.fromarray(enhanced_np)

            else:
                # PIL fallback: simple upscale
                w, h = image.size
                return image.resize((w * self.scale, h * self.scale), Image.LANCZOS)

        except Exception as e:
            print(f"Enhancement failed: {e}")
            return image

    def remove_background(self, image: Image.Image) -> Image.Image:
        """Remove background using rembg"""
        if not REMBG_AVAILABLE:
            print("rembg not available, skipping background removal")
            return image

        try:
            return remove(image)
        except Exception as e:
            print(f"Background removal failed: {e}")
            return image

    def process_image(self, image: Image.Image) -> Image.Image:
        """Full enhancement pipeline"""
        # Remove background if enabled (config option not specified, assume toggle)
        if hasattr(config, 'background_removal_enabled') and config.background_removal_enabled:
            image = self.remove_background(image)

        # Enhance
        image = self.enhance(image)

        return image


# Global enhancer instance
enhancer = ImageEnhancer()