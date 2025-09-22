"""Tests for face blurring"""

import cv2
import numpy as np
import pytest
from unittest.mock import patch, MagicMock

from media_ingest.face_blur import FaceBlurrer


class TestFaceBlurrer:
    """Test face detection and blurring"""

    @patch('cv2.dnn.readNetFromCaffe')
    def test_init_with_model(self, mock_readnet):
        """Test initialization with model files"""
        mock_net = MagicMock()
        mock_readnet.return_value = mock_net

        blurrer = FaceBlurrer(model_dir="test_models")
        assert blurrer.net is not None

    def test_init_without_model(self):
        """Test initialization without model files"""
        blurrer = FaceBlurrer(model_dir="nonexistent")
        assert blurrer.net is None

    @patch('media_ingest.face_blur.config')
    def test_blur_faces_disabled(self, mock_config):
        """Test face blurring when disabled"""
        mock_config.face_blur_enabled = False

        blurrer = FaceBlurrer()
        img = np.zeros((100, 100, 3), dtype=np.uint8)

        result = blurrer.blur_faces(img)
        np.testing.assert_array_equal(result, img)

    @patch('cv2.dnn.readNetFromCaffe')
    def test_blur_faces_with_detection(self, mock_readnet):
        """Test face blurring with mock detection"""
        # Mock the network
        mock_net = MagicMock()
        mock_readnet.return_value = mock_net

        # Mock detection results (one face detected)
        mock_detections = np.zeros((1, 1, 1, 7))
        mock_detections[0, 0, 0, 2] = 0.8  # confidence
        mock_detections[0, 0, 0, 3:7] = [0.1, 0.1, 0.9, 0.9]  # box
        mock_net.forward.return_value = mock_detections

        blurrer = FaceBlurrer()
        img = np.full((100, 100, 3), 128, dtype=np.uint8)

        result = blurrer.blur_faces(img)

        # Should have called the network
        mock_net.setInput.assert_called()
        mock_net.forward.assert_called()

        # Result should be different (blurred)
        assert not np.array_equal(result, img)

    def test_process_image(self):
        """Test the process_image wrapper"""
        blurrer = FaceBlurrer()
        img = np.zeros((50, 50, 3), dtype=np.uint8)

        result = blurrer.process_image(img)
        assert result.shape == img.shape