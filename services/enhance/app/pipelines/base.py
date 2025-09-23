from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

from PIL import Image

from ..config import Settings


class PipelineBase:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        brand_watermark = settings.brand.get("watermark", {})
        self._watermark_path = brand_watermark.get("file")
        self._watermark_opacity = float(brand_watermark.get("opacity", 1.0))
        self._watermark_position = brand_watermark.get("position", "bottom-right")
        self._watermark_margin = int(brand_watermark.get("margin_px", 0))
        privacy = settings.brand.get("privacy", {})
        self._blur_radius = float(privacy.get("blur_radius", 1.2))

    def _apply_privacy(self, image: Image.Image) -> Tuple[Image.Image, bool]:
        if self._blur_radius <= 0:
            return image, False
        adjusted = image.convert("RGBA").copy()
        pixels = adjusted.load()
        width, height = adjusted.size
        delta = int(round(self._blur_radius * 3)) or 1
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                pixels[x, y] = (
                    min(255, r + delta),
                    min(255, g + delta),
                    min(255, b + delta),
                    a,
                )
        return adjusted, True

    def _apply_watermark(self, image: Image.Image) -> Tuple[Image.Image, bool]:
        watermark_image = self._load_watermark()
        if watermark_image is None:
            return image, False
        base = image.convert("RGBA")
        wm = watermark_image
        position = self._resolve_position(base.size, wm.size, self._watermark_position, self._watermark_margin)
        composite = Image.new("RGBA", base.size)
        composite.paste(base, (0, 0))
        composite.paste(wm, position, wm)
        return composite, True

    def _load_watermark(self) -> Optional[Image.Image]:
        if not self._watermark_path:
            return None
        candidate = Path(self._watermark_path)
        candidates = []
        if candidate.is_absolute():
            candidates.append(candidate)
            try:
                candidates.append(self.settings.assets_root.parent / candidate.relative_to("/"))
            except ValueError:
                pass
        else:
            candidates.extend(
                [
                    self.settings.brand_config.parent / candidate,
                    self.settings.assets_root / candidate,
                    self.settings.assets_root.parent / candidate,
                ]
            )
        for option in candidates:
            resolved = option.expanduser().resolve()
            if resolved.exists():
                with Image.open(resolved) as wm:
                    watermark = wm.convert("RGBA").copy()
                if 0 < self._watermark_opacity < 1:
                    alpha = watermark.split()[-1]
                    alpha = alpha.point(lambda p: int(p * self._watermark_opacity))
                    watermark.putalpha(alpha)
                return watermark
        return None

    def _resolve_position(self, base_size: Tuple[int, int], wm_size: Tuple[int, int], position: str, margin: int) -> Tuple[int, int]:
        base_w, base_h = base_size
        wm_w, wm_h = wm_size
        margin = max(margin, 0)
        if position == "top-left":
            return margin, margin
        if position == "top-right":
            return base_w - wm_w - margin, margin
        if position == "bottom-left":
            return margin, base_h - wm_h - margin
        if position == "center":
            return (base_w - wm_w) // 2, (base_h - wm_h) // 2
        return base_w - wm_w - margin, base_h - wm_h - margin


__all__ = ["PipelineBase"]
