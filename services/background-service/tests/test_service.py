"""Basic tests for the background processing service."""

import pytest
import numpy as np
import cv2
from pathlib import Path
from fastapi.testclient import TestClient
import io
from PIL import Image

from src.main import app
from src.config import settings
from src.io import load_image, save_image
from src.masking import extract_foreground_mask
from src.enhance import cleanup_background_transparent, cleanup_background_soften


client = TestClient(app)


def create_test_image(width: int = 256, height: int = 256) -> bytes:
    """Create a test image as bytes."""
    # Create a simple test image with a colored rectangle
    image = np.zeros((height, width, 3), dtype=np.uint8)
    # Add a colored rectangle in the center
    cv2.rectangle(image, (width//4, height//4), (3*width//4, 3*height//4), (0, 255, 0), -1)
    
    # Convert to PIL and then to bytes
    pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    img_byte_arr = io.BytesIO()
    pil_image.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    
    return img_byte_arr.getvalue()


import os

class TestAPI:
    def test_rate_limiter(self, monkeypatch):
        """Test that rate limiter returns 429 after exceeding limit."""
        monkeypatch.setenv('BG_REQS_PER_MIN', '2')
        from src.main import _consume_token
        # Consume all tokens
        _consume_token(); _consume_token()
        # Next should fail
        assert not _consume_token()

    def test_4k_rejection(self, monkeypatch):
        """Test 4K rejection logic in SDXL mode."""
        monkeypatch.setenv('ALLOW_4K', '0')
        from src.config import settings, BGEngine
        settings.bg_engine = BGEngine.SDXL
        test_image = create_test_image(5000, 5000)
        response = client.post(
            "/background/replace",
            files={"file": ("test.jpg", test_image, "image/jpeg")},
            data={"prompt": "test", "steps": 20, "guidance_scale": 7.5}
        )
        assert response.status_code == 400
        assert "4K+ resolution not allowed" in response.text
    """Test API endpoints."""
    
    def test_root_endpoint(self):
        """Test root endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert data["service"] == "Background Processing Service"
    
    def test_health_endpoint(self):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "engine" in data
        assert "device" in data
    
    def test_cleanup_endpoint_transparent(self):
        """Test background cleanup with transparent mode."""
        test_image_bytes = create_test_image()
        
        response = client.post(
            "/background/cleanup",
            files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"mode": "transparent", "enhance_fg": True, "denoise": False}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "output_path" in data
        assert Path(data["output_path"]).exists()
    
    def test_cleanup_endpoint_soften(self):
        """Test background cleanup with soften mode."""
        test_image_bytes = create_test_image()
        
        response = client.post(
            "/background/cleanup",
            files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"mode": "soften", "enhance_fg": False, "denoise": True}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "output_path" in data
    
    def test_cleanup_invalid_mode(self):
        """Test cleanup with invalid mode."""
        test_image_bytes = create_test_image()
        
        response = client.post(
            "/background/cleanup",
            files={"file": ("test.jpg", test_image_bytes, "image/jpeg")},
            data={"mode": "invalid", "enhance_fg": True}
        )
        
        assert response.status_code == 400


class TestImageProcessing:
    """Test image processing functions."""
    
    def test_load_image(self):
        """Test image loading."""
        test_image_bytes = create_test_image(100, 100)
        image = load_image(test_image_bytes)
        
        assert isinstance(image, np.ndarray)
        assert image.shape == (100, 100, 3)
        assert image.dtype == np.uint8
    
    def test_extract_foreground_mask(self):
        """Test foreground mask extraction."""
        test_image_bytes = create_test_image(100, 100)
        image = load_image(test_image_bytes)
        
        mask = extract_foreground_mask(image)
        
        assert isinstance(mask, np.ndarray)
        assert mask.shape == (100, 100)
        assert mask.dtype == np.uint8
        assert np.any(mask > 0)  # Should have some foreground pixels
    
    def test_cleanup_background_transparent(self):
        """Test transparent background cleanup."""
        test_image_bytes = create_test_image(100, 100)
        image = load_image(test_image_bytes)
        mask = extract_foreground_mask(image)
        
        result = cleanup_background_transparent(image, mask)
        
        assert isinstance(result, np.ndarray)
        assert result.shape == (100, 100, 4)  # Should have alpha channel
        assert result.dtype == np.uint8
    
    def test_cleanup_background_soften(self):
        """Test soften background cleanup."""
        test_image_bytes = create_test_image(100, 100)
        image = load_image(test_image_bytes)
        mask = extract_foreground_mask(image)
        
        result = cleanup_background_soften(image, mask)
        
        assert isinstance(result, np.ndarray)
        assert result.shape == (100, 100, 3)
        assert result.dtype == np.uint8


class TestConfiguration:
    """Test configuration settings."""
    
    def test_settings_loaded(self):
        """Test that settings are properly loaded."""
        assert settings.output_dir.exists()
        assert settings.device in ["cpu", "cuda"]
        assert hasattr(settings, "bg_engine")
        assert hasattr(settings, "host")
        assert hasattr(settings, "port")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])