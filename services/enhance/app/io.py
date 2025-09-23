from __future__ import annotations

import io
import uuid
from datetime import datetime
from pathlib import Path
from typing import Tuple

from PIL import Image

from .config import Settings


def generate_asset_id() -> str:
    return uuid.uuid4().hex


def ensure_asset_dir(settings: Settings, asset_id: str) -> Tuple[Path, str]:
    today = datetime.utcnow().strftime("%Y%m%d")
    base = settings.assets_ready_path() / today / asset_id
    base.mkdir(parents=True, exist_ok=True)
    return base, today


def save_image(image: Image.Image, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG")


def create_output_url(date_segment: str, asset_id: str, filename: str) -> str:
    relative = Path("/assets/ready") / date_segment / asset_id / filename
    return relative.as_posix()


def load_image_from_bytes(image_bytes: bytes) -> Image.Image:
    stream = io.BytesIO(image_bytes)
    image = Image.open(stream)
    image.load()
    return image.convert("RGBA")
