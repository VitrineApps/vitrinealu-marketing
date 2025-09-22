"""Integration tests for the complete media ingest pipeline"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from media_ingest.pipeline import MediaPipeline
from media_ingest.config import config


@pytest.fixture
def temp_dirs(tmp_path):
    """Setup temporary directories for testing"""
    config.output_base_path = str(tmp_path / "output")
    config.temp_dir = str(tmp_path / "temp")
    config.processed_db_path = str(tmp_path / "processed.db")
    config.face_blur_enabled = False  # Disable for faster testing
    config.enhancement_enabled = False  # Disable for faster testing

    return tmp_path


@pytest.fixture
def sample_images(temp_dirs):
    """Create sample images for testing"""
    images = []

    # Good quality image
    good_img = Image.new('RGB', (400, 400), color='lightblue')
    good_path = temp_dirs / "good_sample.jpg"
    good_img.save(good_path)
    images.append(("good", good_path))

    # Low quality image (should be rejected)
    low_img = Image.new('RGB', (50, 50), color='gray')
    low_path = temp_dirs / "low_sample.jpg"
    low_img.save(low_path)
    images.append(("low", low_path))

    return images


class TestIntegration:
    """Integration tests for the complete pipeline"""

    @patch('media_ingest.curation.curation_engine')
    def test_full_pipeline_good_image(self, mock_curation, temp_dirs, sample_images):
        """Test full pipeline with a good quality image"""
        # Mock curation to accept the image
        mock_curation.score_image.return_value = {
            'aesthetic': 0.9,
            'sharpness': 500.0,
            'exposure': 0.8
        }
        mock_curation.should_keep_image.return_value = (True, [])
        mock_curation.compute_perceptual_hash.return_value = "unique_hash_123"
        mock_curation.check_duplicate.return_value = False

        pipeline = MediaPipeline()

        good_path = None
        for quality, path in sample_images:
            if quality == "good":
                good_path = path
                break

        assert good_path is not None

        # Process the image
        result = pipeline.process_file(good_path, source='integration_test')

        # Should succeed
        assert result is not None
        assert result.exists()

        # Check sidecar JSON
        json_path = result.with_suffix('.json')
        assert json_path.exists()

        import json
        with open(json_path) as f:
            metadata = json.load(f)

        assert metadata['source'] == 'integration_test'
        assert metadata['decisions']['kept'] is True
        assert 'scores' in metadata
        assert metadata['scores']['aesthetic'] == 0.9

    @patch('media_ingest.curation.curation_engine')
    def test_full_pipeline_rejected_image(self, mock_curation, temp_dirs, sample_images):
        """Test full pipeline rejecting a low quality image"""
        # Mock curation to reject the image
        mock_curation.score_image.return_value = {
            'aesthetic': 0.1,
            'sharpness': 50.0,
            'exposure': 0.2
        }
        mock_curation.should_keep_image.return_value = (False, ['low aesthetic', 'poor exposure'])
        mock_curation.compute_perceptual_hash.return_value = "unique_hash_456"
        mock_curation.check_duplicate.return_value = False

        pipeline = MediaPipeline()

        low_path = None
        for quality, path in sample_images:
            if quality == "low":
                low_path = path
                break

        assert low_path is not None

        # Process the image
        result = pipeline.process_file(low_path, source='integration_test')

        # Should be rejected
        assert result is None

    def test_batch_processing(self, temp_dirs, sample_images):
        """Test batch processing of multiple images"""
        pipeline = MediaPipeline()

        image_paths = [path for _, path in sample_images]

        # Mock curation for batch (accept all)
        with patch('media_ingest.curation.curation_engine') as mock_curation:
            mock_curation.score_image.return_value = {
                'aesthetic': 0.8,
                'sharpness': 300.0,
                'exposure': 0.7
            }
            mock_curation.should_keep_image.return_value = (True, [])
            mock_curation.compute_perceptual_hash.side_effect = [f"hash_{i}" for i in range(len(image_paths))]
            mock_curation.check_duplicate.return_value = False

            results = pipeline.process_batch(image_paths, source='batch_test', max_workers=2)

            # Should process all images
            assert len(results) == len(image_paths)
            for result in results:
                assert result is not None
                assert result.exists()