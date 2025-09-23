from __future__ import annotations

import io
from typing import Any, Dict, Optional, Tuple

from PIL import Image

from ..config import Settings
from ..io import load_image_from_bytes
from ..services.gemini import GeminiImageClient, GeminiError
from ..services.local import LocalEnhancer, load_local_config
from .base import PipelineBase


class EnhancePipeline(PipelineBase):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        providers = settings.providers.get("image_enhance", {})
        self.backend = providers.get("backend", "local")
        gemini_cfg = providers.get("gemini", {})
        self.gemini_client: Optional[GeminiImageClient] = None
        if settings.gemini_api_key:
            self.gemini_client = GeminiImageClient(
                settings.gemini_api_key,
                gemini_cfg.get("model", "gemini-1.5-pro-latest"),
                gemini_cfg.get("prompt_preset", settings.default_preset),
            )
        local_cfg = load_local_config(providers.get("local"))
        self.local_enhancer = LocalEnhancer(local_cfg)

    def execute(self, image: Image.Image, preset: str, metadata: Dict[str, Any] | None = None) -> Tuple[Image.Image, Dict[str, Any]]:
        metadata = metadata or {}
        backend_used: str
        processed: Optional[Image.Image]
        if self.backend == "gemini" and self.gemini_client and self.gemini_client.is_configured():
            try:
                processed = self._run_gemini(image, preset)
                backend_used = "gemini"
            except GeminiError:
                processed = self.local_enhancer.enhance_image(image)
                backend_used = "local-fallback"
        else:
            processed = self.local_enhancer.enhance_image(image)
            backend_used = "local"

        blurred, blur_applied = self._apply_privacy(processed)
        watermarked, watermark_applied = self._apply_watermark(blurred)
        metadata.update(
            {
                "preset": preset,
                "backend": backend_used,
                "watermarkApplied": watermark_applied,
                "privacyBlurApplied": blur_applied,
            }
        )
        return watermarked, metadata

    def _run_gemini(self, image: Image.Image, preset: str) -> Image.Image:
        buffer = io.BytesIO()
        image.convert("RGBA").save(buffer, format="PNG")
        gemini_bytes = self.gemini_client.enhance_image(buffer.getvalue(), preset)
        return load_image_from_bytes(gemini_bytes)


__all__ = ["EnhancePipeline"]
