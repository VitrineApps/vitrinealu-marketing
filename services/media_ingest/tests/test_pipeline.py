"""Tests for media processing pipeline"""

import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

from PIL import Image

from media_ingest.pipeline import MediaPipeline, ProcessedDatabase
from media_ingest.config import config


@pytest.fixture
def sample_image(tmp_path):
    """Create a sample image for testing"""
    img = Image.new('RGB', (200, 200), color='blue')
    img_path = tmp_path / "sample.jpg"
    img.save(img_path)
    return img_path


@pytest.fixture
def pipeline_instance(tmp_path):
    """Create a pipeline instance with temporary database"""
    db_path = tmp_path / "test.db"
    config.processed_db_path = str(db_path)
    config.output_base_path = str(tmp_path / "output")
    config.temp_dir = str(tmp_path / "temp")

    pipeline = MediaPipeline()
    return pipeline


class TestProcessedDatabase:
    """Test the processed files database"""

    def test_init_db(self, tmp_path):
        db_path = tmp_path / "test.db"
        db = ProcessedDatabase(str(db_path))

        # Check table exists
        import sqlite3
        with sqlite3.connect(str(db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='processed'")
            assert cursor.fetchone() is not None

    def test_mark_and_check_processed(self, tmp_path):
        db_path = tmp_path / "test.db"
        db = ProcessedDatabase(str(db_path))

        sha256 = "test_hash"
        assert not db.is_processed(sha256)

        db.mark_processed(sha256, "/input", "/output", "test")
        assert db.is_processed(sha256)


class TestMediaPipeline:
    """Test the main processing pipeline"""

    @patch('media_ingest.curation.curation_engine')
    @patch('media_ingest.enhance.enhancer')
    @patch('media_ingest.watermark.watermark_applier')
    @patch('media_ingest.face_blur.face_blurrer')
    def test_process_file_success(self, mock_blurrer, mock_watermark, mock_enhancer, mock_curation, pipeline_instance, sample_image):
        """Test successful file processing"""
        # Mock curation to return good scores
        mock_curation.score_image.return_value = {
            'aesthetic': 0.8,
            'sharpness': 200.0,
            'exposure': 0.7
        }
        mock_curation.should_keep_image.return_value = (True, [])
        mock_curation.compute_perceptual_hash.return_value = "unique_hash"
        mock_curation.check_duplicate.return_value = False

        # Mock enhancement
        mock_enhancer.process_image.return_value = Image.new('RGB', (200, 200), color='green')

        # Mock watermark
        mock_watermark.apply_watermark.return_value = Image.new('RGB', (200, 200), color='yellow')

        # Mock face blur
        mock_blurrer.process_image.return_value = Image.new('RGB', (200, 200), color='red')

        result = pipeline_instance.process_file(sample_image, source='test')

        assert result is not None
        assert result.exists()

        # Check sidecar JSON
        json_path = result.with_suffix('.json')
        assert json_path.exists()

        with open(json_path) as f:
            metadata = json.load(f)

        assert metadata['source'] == 'test'
        assert metadata['decisions']['kept'] is True
        assert 'scores' in metadata

    @patch('media_ingest.curation.curation_engine')
    def test_process_duplicate_file(self, mock_curation, pipeline_instance, sample_image):
        """Test skipping duplicate files"""
        mock_curation.check_duplicate.return_value = True

        result = pipeline_instance.process_file(sample_image)

        assert result is None

    @patch('media_ingest.curation.curation_engine')
    def test_process_rejected_file(self, mock_curation, pipeline_instance, sample_image):
        """Test rejecting low-quality files"""
        mock_curation.score_image.return_value = {'aesthetic': 0.1}
        mock_curation.should_keep_image.return_value = (False, ['low aesthetic'])
        mock_curation.compute_perceptual_hash.return_value = "hash"
        mock_curation.check_duplicate.return_value = False

        result = pipeline_instance.process_file(sample_image)

        assert result is None

    def test_generate_output_path(self, pipeline_instance, sample_image):
        """Test output path generation"""
        scores = {'aesthetic': 0.8}
        output_path = pipeline_instance.generate_output_path(sample_image, scores)

        assert output_path.parent.name == sample_image.stem  # Uses filename as slug
        assert output_path.suffix == '.jpg'