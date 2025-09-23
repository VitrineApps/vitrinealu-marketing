from __future__ import annotations

from PIL import Image

from app.config import get_settings
from app.io import load_image_from_bytes
from app.pipelines.enhance import EnhancePipeline
from app.services.gemini import GeminiError


class _FailingGemini:
    def is_configured(self) -> bool:
        return True

    def enhance_image(self, *_args, **_kwargs) -> bytes:
        raise GeminiError("boom")


def test_enhance_pipeline_falls_back_to_local(sample_image_bytes) -> None:
    settings = get_settings()
    pipeline = EnhancePipeline(settings)
    pipeline.backend = "gemini"
    pipeline.gemini_client = _FailingGemini()  # type: ignore[assignment]
    image = load_image_from_bytes(sample_image_bytes)
    result, metadata = pipeline.execute(image, settings.default_preset)
    assert metadata["backend"] == "local-fallback"
    assert isinstance(result, Image.Image)
