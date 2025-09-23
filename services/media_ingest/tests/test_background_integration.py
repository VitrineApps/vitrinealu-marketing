"""Tests for background processing integration"""

import pytest
from pathlib import Path
from unittest.mock import patch, Mock, MagicMock
from PIL import Image
import json

from media_ingest.pipeline import MediaPipeline
from media_ingest.background_client import BackgroundMetadata, BGMode


@pytest.fixture
def pipeline_instance():
    """Create a MediaPipeline instance for testing"""
    with patch('media_ingest.pipeline.config') as mock_config:
        # Mock config values
        mock_config.background_automation = None
        mock_config.background_api_url = "http://localhost:8089"
        mock_config.background_preset = "vitrinealu"
        mock_config.background_prompt_type = "studio"
        mock_config.temp_dir = "/tmp/test"
        
        return MediaPipeline()


@pytest.fixture
def sample_image():
    """Create a sample image for testing"""
    return Image.new('RGB', (100, 100), color='red')


class TestBackgroundIntegration:
    """Test background processing integration in media pipeline"""

    @patch('media_ingest.pipeline.create_background_client')
    @patch('media_ingest.pipeline.config')
    def test_background_cleanup_integration(self, mock_config, mock_create_client, pipeline_instance, tmp_path):
        """Test background cleanup integration in pipeline"""
        # Setup config
        mock_config.background_automation = "cleanup"
        mock_config.temp_dir = str(tmp_path)
        
        # Mock background client
        mock_client = Mock()
        mock_client.is_healthy.return_value = True
        mock_client.cleanup.return_value = BackgroundMetadata(
            mode='cleanup',
            out_jpg='/output/cleaned.jpg',
            processed_at='2024-01-01T00:00:00',
            settings={'mode': 'transparent'}
        )
        mock_create_client.return_value = mock_client
        
        # Create test image
        test_image_path = tmp_path / "test.jpg"
        test_image = Image.new('RGB', (100, 100), color='blue')
        
        # Test background processing
        result = pipeline_instance.process_background(test_image_path)
        
        assert result is not None
        assert result['mode'] == 'cleanup'
        assert result['outJpg'] == '/output/cleaned.jpg'
        assert 'processedAt' in result
        
        # Verify client was called correctly
        mock_client.cleanup.assert_called_once()
        call_args = mock_client.cleanup.call_args
        assert call_args[1]['mode'] == BGMode.TRANSPARENT
        assert call_args[1]['enhance_fg'] is True

    @patch('media_ingest.pipeline.create_background_client')
    @patch('media_ingest.pipeline.config')
    @patch('media_ingest.pipeline.BRAND_PRESETS')
    def test_background_replace_integration(self, mock_presets, mock_config, mock_create_client, pipeline_instance, tmp_path):
        """Test background replacement integration in pipeline"""
        # Setup config
        mock_config.background_automation = "replace"
        mock_config.background_preset = "vitrinealu"
        mock_config.background_prompt_type = "studio"
        mock_config.temp_dir = str(tmp_path)
        
        # Mock brand presets
        mock_presets.get.return_value = {
            "prompts": {
                "studio": "professional photography studio",
                "garden": "modern garden"
            },
            "negative_prompt": "people, text",
            "settings": {
                "engine": "SDXL",
                "steps": 25,
                "guidance_scale": 7.5
            }
        }
        
        # Mock background client
        mock_client = Mock()
        mock_client.is_healthy.return_value = True
        mock_client.replace.return_value = BackgroundMetadata(
            mode='replace',
            engine='SDXL',
            out_jpg='/output/replaced.jpg',
            processed_at='2024-01-01T00:00:00',
            prompt='professional photography studio',
            settings={'steps': 25}
        )
        mock_create_client.return_value = mock_client
        
        # Create test image
        test_image_path = tmp_path / "test.jpg"
        
        # Test background processing
        result = pipeline_instance.process_background(test_image_path)
        
        assert result is not None
        assert result['mode'] == 'replace'
        assert result['engine'] == 'SDXL'
        assert result['outJpg'] == '/output/replaced.jpg'
        assert result['prompt'] == 'professional photography studio'
        
        # Verify client was called with correct prompt
        mock_client.replace.assert_called_once()
        call_args = mock_client.replace.call_args
        assert call_args[1]['prompt'] == 'professional photography studio'

    @patch('media_ingest.pipeline.create_background_client')
    @patch('media_ingest.pipeline.config')
    def test_background_disabled(self, mock_config, mock_create_client, pipeline_instance, tmp_path):
        """Test that background processing is skipped when disabled"""
        # Setup config
        mock_config.background_automation = None
        
        # Test background processing
        result = pipeline_instance.process_background(tmp_path / "test.jpg")
        
        assert result is None
        mock_create_client.assert_not_called()

    @patch('media_ingest.pipeline.create_background_client')
    @patch('media_ingest.pipeline.config')
    def test_background_service_unhealthy(self, mock_config, mock_create_client, pipeline_instance, tmp_path, capfd):
        """Test handling when background service is not healthy"""
        # Setup config
        mock_config.background_automation = "cleanup"
        
        # Mock unhealthy client
        mock_client = Mock()
        mock_client.is_healthy.return_value = False
        mock_create_client.return_value = mock_client
        
        # Test background processing
        result = pipeline_instance.process_background(tmp_path / "test.jpg")
        
        assert result is None
        
        # Check that warning was printed
        captured = capfd.readouterr()
        assert "Background service is not available" in captured.out

    @patch('media_ingest.pipeline.curation_engine')
    @patch('media_ingest.pipeline.enhancer')
    @patch('media_ingest.pipeline.watermark_applier')
    @patch('media_ingest.pipeline.face_blurrer')
    @patch('media_ingest.pipeline.create_background_client')
    @patch('media_ingest.pipeline.config')
    def test_full_pipeline_with_background(self, mock_config, mock_create_client, 
                                         mock_blurrer, mock_watermark, mock_enhancer, 
                                         mock_curation, pipeline_instance, tmp_path):
        """Test full pipeline integration with background processing"""
        # Setup mocks
        mock_config.background_automation = "cleanup"
        mock_config.temp_dir = str(tmp_path)
        mock_config.face_blur_enabled = False
        mock_config.enhancement_enabled = True
        mock_config.aesthetic_threshold = 0.5
        mock_config.sharpness_threshold = 100.0
        mock_config.output_base_path = str(tmp_path / "output")
        
        # Mock curation
        mock_curation.score_image.return_value = {
            'aesthetic': 0.8,
            'sharpness': 150.0,
            'exposure': 0.7,
            'blur': 200.0
        }
        mock_curation.should_keep_image.return_value = (True, [])
        mock_curation.compute_perceptual_hash.return_value = "abc123"
        mock_curation.check_duplicate.return_value = False
        
        # Mock enhancement and watermark
        mock_enhancer.enhance_image.return_value = Image.new('RGB', (200, 200), color='green')
        mock_watermark.apply_watermark.return_value = Image.new('RGB', (200, 200), color='yellow')
        
        # Mock background client
        mock_client = Mock()
        mock_client.is_healthy.return_value = True
        mock_client.cleanup.return_value = BackgroundMetadata(
            mode='cleanup',
            out_jpg='/background/cleaned.jpg',
            processed_at='2024-01-01T00:00:00'
        )
        mock_create_client.return_value = mock_client
        
        # Create test input
        input_path = tmp_path / "input.jpg"
        test_image = Image.new('RGB', (100, 100), color='red')
        test_image.save(input_path)
        
        # Process file
        result = pipeline_instance.process_file(input_path, source='test')
        
        # Verify result
        assert result is not None
        assert result.exists()
        
        # Check sidecar JSON includes background metadata
        json_path = result.with_suffix('.json')
        assert json_path.exists()
        
        with open(json_path) as f:
            metadata = json.load(f)
        
        assert 'background' in metadata
        assert metadata['background']['mode'] == 'cleanup'
        assert metadata['background']['outJpg'] == '/background/cleaned.jpg'

    @patch('media_ingest.pipeline.config')
    def test_background_processing_error_handling(self, mock_config, pipeline_instance, tmp_path, capfd):
        """Test error handling in background processing"""
        # Setup config
        mock_config.background_automation = "cleanup"
        
        # Test with non-existent client (should handle import error gracefully)
        with patch('media_ingest.pipeline.create_background_client', side_effect=Exception("Connection failed")):
            result = pipeline_instance.process_background(tmp_path / "test.jpg")
            
            assert result is None
            captured = capfd.readouterr()
            assert "Unexpected error in background processing" in captured.out