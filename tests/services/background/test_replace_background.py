import pytest
import os
import tempfile
from unittest.mock import Mock, patch, MagicMock, ANY
from PIL import Image
import numpy as np
from services.background.replace_background import replace_background, DiffusionEngine, RunwayEngine, generate_mask
import httpx

@pytest.fixture
def sample_image():
    # Create a simple test image
    img = Image.new('RGB', (100, 100), color='red')
    return img

@pytest.fixture
def tmp_paths(tmp_path):
    in_path = tmp_path / "input.jpg"
    out_path = tmp_path / "output.jpg"
    mask_path = tmp_path / "mask.png"
    return in_path, out_path, mask_path

def test_replace_background_with_mask_path(tmp_paths, sample_image):
    in_path, out_path, mask_path = tmp_paths
    sample_image.save(in_path)
    mask = Image.new('L', (100, 100), color=255)
    mask.save(mask_path)

    with patch('services.background.replace_background.DiffusionEngine') as mock_engine_class:
        mock_engine = Mock()
        mock_engine.replace_background.return_value = sample_image
        mock_engine_class.return_value = mock_engine

        result = replace_background(str(in_path), str(out_path), "modern_garden_day", mask_path=str(mask_path))

        assert result["engine"] == "diffusion"
        assert result["preset"] == "modern_garden_day"
        assert "output" in result["artifacts"]
        assert result["artifacts"]["mask"] == str(mask_path)
        mock_engine.replace_background.assert_called_once()

def test_replace_background_auto_mask(tmp_paths, sample_image):
    in_path, out_path, _ = tmp_paths
    sample_image.save(in_path)

    with patch('services.background.replace_background.DiffusionEngine') as mock_engine_class, \
         patch('services.background.replace_background.generate_mask') as mock_generate_mask:
        mock_engine = Mock()
        mock_engine.replace_background.return_value = sample_image
        mock_engine_class.return_value = mock_engine
        mock_mask = Image.new('L', (100, 100), color=0)
        mock_generate_mask.return_value = mock_mask

        result = replace_background(str(in_path), str(out_path), "modern_garden_day")

        assert result["artifacts"]["mask"] == str(out_path) + ".mask.png"
        mock_generate_mask.assert_called_once_with(ANY)

def test_deterministic_mode(tmp_paths, sample_image):
    in_path, out_path, _ = tmp_paths
    sample_image.save(in_path)

    with patch.dict(os.environ, {"BG_REPLACE_DETERMINISTIC": "true"}), \
         patch('services.background.replace_background.DiffusionEngine') as mock_engine_class:
        mock_engine = Mock()
        mock_engine.replace_background.return_value = sample_image
        mock_engine_class.return_value = mock_engine

        result1 = replace_background(str(in_path), str(out_path), "modern_garden_day", seed=42)
        result2 = replace_background(str(in_path), str(out_path), "modern_garden_day", seed=42)

        assert result1["seed"] == 42
        assert result2["seed"] == 42

def test_presets_override(tmp_paths, sample_image):
    in_path, out_path, _ = tmp_paths
    sample_image.save(in_path)

    with patch('services.background.replace_background.DiffusionEngine') as mock_engine_class:
        mock_engine = Mock()
        mock_engine.replace_background.return_value = sample_image
        mock_engine_class.return_value = mock_engine

        overrides = {"guidance_scale": 9.0}
        replace_background(str(in_path), str(out_path), "modern_garden_day", prompt_overrides=overrides)

        # Check that override was passed
        call_args = mock_engine.replace_background.call_args
        assert call_args[1]["guidance_scale"] == 9.0

def test_runway_engine_retry():
    with patch.dict(os.environ, {"BG_REPLACE_ENGINE": "runway", "RUNWAY_API_KEY": "test"}), \
         patch('services.background.replace_background.httpx.post') as mock_post:
        # First call raises 429, second succeeds
        mock_post.side_effect = [
            httpx.HTTPStatusError("429", request=Mock(), response=Mock(status_code=429)),
            Mock(json=lambda: {"result": "data"})
        ]

        engine = RunwayEngine()
        img = Image.new('RGB', (10, 10))
        mask = Image.new('L', (10, 10))

        result = engine.replace_background(img, mask, "prompt", "neg", 7.5, 0.8, None)
        # Should have retried
        assert mock_post.call_count == 2

def test_generate_mask(sample_image):
    with patch('services.background.replace_background.deeplabv3_resnet101') as mock_model_class, \
         patch('services.background.replace_background.torch') as mock_torch:
        mock_model = Mock()
        mock_output = Mock()
        mock_output.argmax.return_value.byte.return_value.cpu.return_value.numpy.return_value = np.zeros((100, 100), dtype=np.uint8)
        mock_model.return_value = {'out': [mock_output]}
        mock_model_class.return_value = mock_model
        mock_torch.no_grad.return_value.__enter__ = Mock()
        mock_torch.no_grad.return_value.__exit__ = Mock()

        mask = generate_mask(sample_image)
        assert isinstance(mask, Image.Image)
        assert mask.mode == 'L'