"""Tests for brand configuration loader."""

import pytest
import yaml
from pathlib import Path
from unittest.mock import mock_open, patch
from pydantic import ValidationError

from media_ingest.brand_loader import (
    BrandConfig,
    BrandColors,
    BrandFonts,
    BrandWatermark,
    BrandAspectRatios,
    BrandSafeAreas,
    load_brand_config,
    get_default_brand_config,
)


class TestBrandConfig:
    """Test brand configuration models and loading."""

    @pytest.fixture
    def valid_brand_data(self) -> dict:
        """Valid brand configuration data."""
        return {
            "brand": "vitrinealu",
            "tagline": "Bring light into living",
            "colors": {
                "primary": "#111827",
                "secondary": "#FBBF24",
                "accent": "#0EA5E9",
                "text_light": "#FFFFFF",
                "text_dark": "#111827",
            },
            "fonts": {
                "primary": "Montserrat",
                "secondary": "Lato",
            },
            "watermark": {
                "path": "assets/brand/watermark.png",
                "opacity": 0.85,
                "margin_px": 48,
            },
            "aspect_ratios": {
                "reels": "9:16",
                "square": "1:1",
                "landscape": "16:9",
            },
            "safe_areas": {
                "reels": {
                    "top": 220,
                    "bottom": 220,
                    "left": 40,
                    "right": 40,
                },
            },
        }

    def test_brand_config_validation_success(self, valid_brand_data):
        """Test that valid brand config passes validation."""
        config = BrandConfig(**valid_brand_data)
        assert config.brand == "vitrinealu"
        assert config.tagline == "Bring light into living"
        assert config.colors.primary == "#111827"
        assert config.watermark.opacity == 0.85
        assert config.safe_areas.reels.top == 220

    def test_brand_config_validation_empty_brand(self, valid_brand_data):
        """Test that empty brand name fails validation."""
        invalid_data = valid_brand_data.copy()
        invalid_data["brand"] = ""

        with pytest.raises(ValidationError) as exc_info:
            BrandConfig(**invalid_data)

        assert "Brand name cannot be empty" in str(exc_info.value)

    def test_brand_config_validation_empty_tagline(self, valid_brand_data):
        """Test that empty tagline fails validation."""
        invalid_data = valid_brand_data.copy()
        invalid_data["tagline"] = ""

        with pytest.raises(ValidationError) as exc_info:
            BrandConfig(**invalid_data)

        assert "Tagline cannot be empty" in str(exc_info.value)

    def test_brand_config_validation_invalid_opacity(self, valid_brand_data):
        """Test that invalid opacity fails validation."""
        invalid_data = valid_brand_data.copy()
        invalid_data["watermark"]["opacity"] = 1.5

        with pytest.raises(ValidationError):
            BrandConfig(**invalid_data)

    def test_brand_config_validation_negative_margin(self, valid_brand_data):
        """Test that negative margin fails validation."""
        invalid_data = valid_brand_data.copy()
        invalid_data["watermark"]["margin_px"] = -10

        with pytest.raises(ValidationError):
            BrandConfig(**invalid_data)

    @patch('pathlib.Path.cwd')
    @patch('builtins.open', new_callable=mock_open)
    @patch('yaml.safe_load')
    def test_load_brand_config_success(self, mock_yaml_load, mock_file, mock_cwd, valid_brand_data):
        """Test successful loading of brand config."""
        mock_cwd.return_value = Path("/test")
        mock_yaml_load.return_value = valid_brand_data

        config = load_brand_config()

        assert isinstance(config, BrandConfig)
        assert config.brand == "vitrinealu"
        mock_file.assert_called_once_with(Path("/test/config/brand.yaml"), 'r', encoding='utf-8')

    @patch('builtins.open')
    def test_load_brand_config_file_not_found(self, mock_file):
        """Test loading config when file doesn't exist."""
        mock_file.side_effect = FileNotFoundError("File not found")

        with pytest.raises(FileNotFoundError) as exc_info:
            load_brand_config(Path("/nonexistent/path.yaml"))

        assert "Brand config file not found" in str(exc_info.value)

    @patch('builtins.open', new_callable=mock_open)
    @patch('yaml.safe_load')
    def test_load_brand_config_invalid_yaml(self, mock_yaml_load, mock_file):
        """Test loading config with invalid YAML."""
        mock_yaml_load.side_effect = yaml.YAMLError("Invalid YAML")

        with pytest.raises(yaml.YAMLError) as exc_info:
            load_brand_config(Path("/test/path.yaml"))

        assert "Invalid YAML in brand config" in str(exc_info.value)

    @patch('builtins.open', new_callable=mock_open)
    @patch('yaml.safe_load')
    def test_load_brand_config_invalid_schema(self, mock_yaml_load, mock_file):
        """Test loading config with invalid schema."""
        mock_yaml_load.return_value = {"invalid": "data"}

        with pytest.raises(ValidationError):
            load_brand_config(Path("/test/path.yaml"))

    @patch('media_ingest.brand_loader.load_brand_config')
    def test_get_default_brand_config(self, mock_load):
        """Test getting default brand config."""
        mock_config = BrandConfig(
            brand="test",
            tagline="test tagline",
            colors=BrandColors(
                primary="#000",
                secondary="#111",
                accent="#222",
                text_light="#fff",
                text_dark="#000"
            ),
            fonts=BrandFonts(primary="Arial", secondary="Helvetica"),
            watermark=BrandWatermark(path="test.png", opacity=0.5, margin_px=10),
            aspect_ratios=BrandAspectRatios(reels="9:16", square="1:1", landscape="16:9"),
            safe_areas=BrandSafeAreas(
                reels=BrandSafeAreas.ReelsSafeArea(top=0, bottom=0, left=0, right=0)
            )
        )
        mock_load.return_value = mock_config

        result = get_default_brand_config()

        assert result == mock_config
        mock_load.assert_called_once_with()