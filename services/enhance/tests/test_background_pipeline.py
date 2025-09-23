from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops

from app.config import get_settings
from app.io import load_image_from_bytes
from app.pipelines.background_replace import BackgroundReplacePipeline


def test_background_pipeline_matches_golden(sample_image_bytes, tmp_path: Path) -> None:
    settings = get_settings()
    pipeline = BackgroundReplacePipeline(settings)
    image = load_image_from_bytes(sample_image_bytes)
    result, metadata = pipeline.execute(image, prompt="airy interior")
    assert metadata["watermarkApplied"] is True
    assert metadata["privacyBlurApplied"] is True

    golden_path = Path(__file__).resolve().parent / "fixtures" / "enhance" / "background_golden.png"
    golden = Image.open(golden_path).convert("RGBA")
    diff = ImageChops.difference(result.convert("RGBA"), golden)
    assert not diff.getbbox()

    output_path = tmp_path / "result.png"
    result.save(output_path)
    assert output_path.exists()
