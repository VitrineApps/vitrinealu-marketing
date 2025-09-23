from __future__ import annotations

import io
from typing import Any, Dict, Optional, Tuple

from PIL import Image, ImageEnhance

from ..config import Settings
from ..io import load_image_from_bytes
from ..services.gemini import GeminiImageClient, GeminiError
from ..services.local import LocalEnhancer, load_local_config
from .base import PipelineBase


class BackgroundReplacePipeline(PipelineBase):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)
        providers = settings.providers.get("background", {})
        self.mode = providers.get("mode", "clean_or_replace")
        self.replace_prompt = providers.get("replace_prompt")
        image_cfg = settings.providers.get("image_enhance", {})
        gemini_cfg = image_cfg.get("gemini", {})
        self.gemini_client: Optional[GeminiImageClient] = None
        if settings.gemini_api_key:
            self.gemini_client = GeminiImageClient(
                settings.gemini_api_key,
                gemini_cfg.get("model", "gemini-1.5-pro-latest"),
                gemini_cfg.get("prompt_preset", settings.default_preset),
            )
        local_cfg = load_local_config(image_cfg.get("local"))
        self.local_enhancer = LocalEnhancer(local_cfg)

    def execute(self, image: Image.Image, prompt: Optional[str] = None, metadata: Dict[str, Any] | None = None) -> Tuple[Image.Image, Dict[str, Any]]:
        metadata = metadata or {}
        prompt_text = prompt or self.replace_prompt or "clean background"
        backend_used: str
        if self.mode == "clean_only":
            processed = self._clean_background(image)
            backend_used = "clean"
        elif self.gemini_client and self.gemini_client.is_configured():
            try:
                processed = self._run_gemini(image, prompt_text)
                backend_used = "gemini"
            except GeminiError:
                processed = self.local_enhancer.replace_background(image)
                backend_used = "local-fallback"
        else:
            processed = self.local_enhancer.replace_background(image)
            backend_used = "local"

        blurred, blur_applied = self._apply_privacy(processed)
        watermarked, watermark_applied = self._apply_watermark(blurred)
        metadata.update(
            {
                "prompt": prompt_text,
                "backend": backend_used,
                "watermarkApplied": watermark_applied,
                "privacyBlurApplied": blur_applied,
                "mode": self.mode,
            }
        )
        return watermarked, metadata

    def _clean_background(self, image: Image.Image) -> Image.Image:
        cleaned = image.convert("RGBA")
        cleaned = ImageEnhance.Brightness(cleaned).enhance(1.1)
        cleaned = ImageEnhance.Color(cleaned).enhance(0.95)
        return cleaned

    def _run_gemini(self, image: Image.Image, prompt: str) -> Image.Image:
        buffer = io.BytesIO()
        image.convert("RGBA").save(buffer, format="PNG")
        gemini_bytes = self.gemini_client.replace_background(buffer.getvalue(), prompt)
        return load_image_from_bytes(gemini_bytes)


__all__ = ["BackgroundReplacePipeline"]
