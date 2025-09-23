from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image, ImageEnhance


@dataclass
class LocalEnhanceConfig:
    upscaler: Optional[str] = None
    denoise: Optional[str] = None


class LocalEnhancer:
    def __init__(self, config: Optional[LocalEnhanceConfig] = None) -> None:
        self.config = config or LocalEnhanceConfig()

    def enhance_image(self, image: Image.Image) -> Image.Image:
        enhanced = image.convert("RGBA")
        enhanced = ImageEnhance.Sharpness(enhanced).enhance(1.15)
        enhanced = ImageEnhance.Color(enhanced).enhance(1.05)
        enhanced = ImageEnhance.Brightness(enhanced).enhance(1.02)
        return enhanced

    def replace_background(self, image: Image.Image) -> Image.Image:
        base = image.convert("RGBA").copy()
        pixels = base.load()
        width, height = base.size
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                pixels[x, y] = (
                    min(255, int(r * 0.9 + 25)),
                    min(255, int(g * 0.9 + 20)),
                    min(255, int(b * 0.9 + 15)),
                    a,
                )
        return base


def load_local_config(raw: dict | None) -> LocalEnhanceConfig:
    if not raw:
        return LocalEnhanceConfig()
    return LocalEnhanceConfig(
        upscaler=raw.get("upscaler"),
        denoise=raw.get("denoise"),
    )


__all__ = ["LocalEnhancer", "LocalEnhanceConfig", "load_local_config"]
