"""Tests for image enhancement"""

import numpy as np
import pytest
from unittest.mock import patch, MagicMock
from PIL import Image

from media_ingest.enhance import ImageEnhancer


class TestImageEnhancer:
    """Test image enhancement functionality"""

    def test_init_pil_fallback(self):
        """Test initialization with PIL fallback"""
        enhancer = ImageEnhancer(backend='pil')
        assert enhancer.backend == 'pil'
        assert enhancer.model is None

    @patch('media_ingest.enhance.RealESRGANer')
    def test_realesrgan_enhancement(self, mock_realesrgan, tmp_path):
        """Test RealESRGAN enhancement"""
        # Mock RealESRGAN
        mock_model = MagicMock()
        mock_realesrgan.return_value = mock_model
        mock_model.enhance.return_value = (np.random.rand(200, 200, 3) * 255).astype(np.uint8)

        enhancer = ImageEnhancer(backend='realesrgan')

        # Create test image
        img = Image.new('RGB', (100, 100), color='blue')
        result = enhancer.enhance(img)

        assert isinstance(result, Image.Image)
        mock_model.enhance.assert_called_once()

    def test_pil_enhancement(self):
        """Test PIL-based enhancement"""
        enhancer = ImageEnhancer(backend='pil', scale=2)

        img = Image.new('RGB', (50, 50), color='red')
        result = enhancer.enhance(img)

        assert result.size == (100, 100)  # Scaled up

    @patch('media_ingest.enhance.remove')
    def test_background_removal(self, mock_remove):
        """Test background removal"""
        mock_remove.return_value = Image.new('RGBA', (100, 100), color='blue')

        enhancer = ImageEnhancer()

        img = Image.new('RGB', (100, 100), color='red')
        result = enhancer.remove_background(img)

        assert isinstance(result, Image.Image)
        mock_remove.assert_called_once_with(img)

    def test_process_image_pipeline(self):
        """Test full enhancement pipeline"""
        enhancer = ImageEnhancer(backend='pil', scale=2)

        img = Image.new('RGB', (50, 50), color='green')
        result = enhancer.process_image(img)

        assert result.size == (100, 100)