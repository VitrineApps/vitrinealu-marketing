"""Tests for image curation engine"""

import numpy as np
import pytest
from unittest.mock import patch, MagicMock
from PIL import Image

from media_ingest.curation import CurationEngine


@pytest.fixture
def sample_image(tmp_path):
    """Create a sample image for testing"""
    # Create a simple test image
    img = Image.new('RGB', (100, 100), color='gray')
    img_path = tmp_path / "test.jpg"
    img.save(img_path)
    return img_path


class TestCurationEngine:
    """Test the curation engine"""

    @patch('media_ingest.curation.CLIPModel')
    @patch('media_ingest.curation.CLIPProcessor')
    def test_score_aesthetic(self, mock_processor, mock_model, sample_image):
        """Test aesthetic scoring"""
        # Mock CLIP components
        mock_model.from_pretrained.return_value = MagicMock()
        mock_processor.from_pretrained.return_value = MagicMock()

        mock_clip_model = MagicMock()
        mock_model.from_pretrained.return_value = mock_clip_model

        mock_clip_processor = MagicMock()
        mock_processor.from_pretrained.return_value = mock_clip_processor

        # Mock the processing
        mock_clip_model.get_image_features.return_value = np.random.rand(1, 512)
        mock_aesthetic_head = MagicMock()
        mock_aesthetic_head.return_value.sigmoid.return_value.item.return_value = 0.75

        engine = CurationEngine()
        engine.aesthetic_head = mock_aesthetic_head

        pil_image = Image.open(sample_image)
        score = engine._score_aesthetic(pil_image)

        assert isinstance(score, float)
        assert 0 <= score <= 1

    def test_score_sharpness(self, sample_image):
        """Test sharpness scoring"""
        engine = CurationEngine()

        # Create a sharp image (high contrast edges)
        sharp_img = np.zeros((100, 100, 3), dtype=np.uint8)
        sharp_img[50, :, :] = 255  # Horizontal line
        sharp_img[:, 50, :] = 255  # Vertical line

        sharpness = engine._score_sharpness(sharp_img)
        assert sharpness > 0

    def test_score_exposure(self, sample_image):
        """Test exposure scoring"""
        engine = CurationEngine()

        # Well-exposed image (mid-range histogram)
        good_img = np.full((100, 100, 3), 128, dtype=np.uint8)

        exposure = engine._score_exposure(good_img)
        assert 0 <= exposure <= 1

    def test_compute_perceptual_hash(self, sample_image):
        """Test perceptual hash computation"""
        engine = CurationEngine()

        hash_str = engine.compute_perceptual_hash(sample_image)
        assert isinstance(hash_str, str)
        assert len(hash_str) > 0

    def test_is_duplicate(self, sample_image):
        """Test duplicate detection"""
        engine = CurationEngine()

        hash1 = "abcd1234"
        hash2 = "abcd1234"  # Exact match
        assert engine.is_duplicate(hash1, hash2, threshold=0)

        hash3 = "abcd1235"  # One bit different
        assert not engine.is_duplicate(hash1, hash3, threshold=0)

    def test_should_keep_image(self, sample_image):
        """Test image acceptance decision"""
        engine = CurationEngine()

        # Good scores
        good_scores = {
            'aesthetic': 0.9,
            'sharpness': 300.0,
            'exposure': 0.8
        }
        keep, reasons = engine.should_keep_image(good_scores)
        assert keep
        assert len(reasons) == 0

        # Bad scores
        bad_scores = {
            'aesthetic': 0.1,
            'sharpness': 50.0,
            'exposure': 0.2
        }
        keep, reasons = engine.should_keep_image(bad_scores)
        assert not keep
        assert len(reasons) > 0