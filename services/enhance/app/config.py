
from __future__ import annotations

from functools import cached_property, lru_cache
from pathlib import Path
from typing import Any, Dict

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment and YAML config files."""

    assets_root: Path = Field(default_factory=lambda: Path("./assets"))
    brand_config: Path = Field(default=Path("config/brand.yaml"))
    providers_config: Path = Field(default=Path("config/providers.yaml"))
    gemini_api_key: str | None = Field(default=None)
    real_esrgan_bin: str | None = Field(default=None)
    codeformer_bin: str | None = Field(default=None)
    default_preset: str = Field(default="enhance_cinematic")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="allow",
    )

    def model_post_init(self, __context: Dict[str, Any]) -> None:  # type: ignore[override]
        self.assets_root = Path(self.assets_root).expanduser().resolve()
        self.brand_config = Path(self.brand_config).expanduser().resolve()
        self.providers_config = Path(self.providers_config).expanduser().resolve()

    @cached_property
    def brand(self) -> Dict[str, Any]:
        return self._load_yaml(self.brand_config)

    @cached_property
    def providers(self) -> Dict[str, Any]:
        return self._load_yaml(self.providers_config)

    def assets_ready_path(self) -> Path:
        ready = self.assets_root / "ready"
        ready.mkdir(parents=True, exist_ok=True)
        return ready

    def _load_yaml(self, path: Path) -> Dict[str, Any]:
        resolved = Path(path).expanduser().resolve()
        if not resolved.exists():
            raise FileNotFoundError(f"Config file not found: {resolved}")
        with resolved.open("r", encoding="utf-8") as handle:
            data: Dict[str, Any] = yaml.safe_load(handle) or {}
        return data


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
