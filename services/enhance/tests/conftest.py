from __future__ import annotations

import json
from pathlib import Path
from typing import Generator

import pytest
import yaml
from fastapi.testclient import TestClient
from PIL import Image

from app.config import get_settings
from app.main import create_app


@pytest.fixture(autouse=True)
def setup_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    assets_root = tmp_path / "assets"
    assets_root.mkdir(parents=True, exist_ok=True)

    watermark_path = tmp_path / "watermark.png"
    watermark = Image.new("RGBA", (32, 32), (255, 255, 255, 180))
    watermark.save(watermark_path)

    brand_config = {
        "brand": {
            "name": "Test",
            "watermark": {
                "file": str(watermark_path),
                "opacity": 0.75,
                "position": "bottom-right",
                "margin_px": 4,
            },
        },
        "privacy": {
            "blur_radius": 1.0,
        },
    }
    brand_path = tmp_path / "brand.yaml"
    brand_path.write_text(yaml.safe_dump(brand_config), encoding="utf-8")

    providers_config = {
        "image_enhance": {
            "backend": "local",
            "gemini": {
                "model": "gemini-test",
                "prompt_preset": "enhance_cinematic",
            },
            "local": {
                "upscaler": "realesrgan-x4",
                "denoise": "codeformer",
            },
        },
        "background": {
            "mode": "clean_or_replace",
            "replace_prompt": "modern bright interior",
        },
    }
    providers_path = tmp_path / "providers.yaml"
    providers_path.write_text(yaml.safe_dump(providers_config), encoding="utf-8")

    monkeypatch.setenv("ASSETS_ROOT", str(assets_root))
    monkeypatch.setenv("BRAND_CONFIG", str(brand_path))
    monkeypatch.setenv("PROVIDERS_CONFIG", str(providers_path))

    yield

    get_settings.cache_clear()


@pytest.fixture
def test_app() -> TestClient:
    app = create_app()
    with TestClient(app) as client:
        yield client


@pytest.fixture
def sample_image_bytes() -> bytes:
    image = Image.new("RGB", (64, 64), color=(120, 140, 160))
    return _to_png_bytes(image)


def _to_png_bytes(image: Image.Image) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
