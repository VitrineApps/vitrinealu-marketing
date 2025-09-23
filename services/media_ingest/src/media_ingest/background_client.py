"""Background processing client for Python services"""

import os
import json
import time
from pathlib import Path
from typing import Dict, Any, Optional, Union
from dataclasses import dataclass
from enum import Enum

import requests
from loguru import logger


class BGEngine(str, Enum):
    """Background generation engine"""
    SDXL = "SDXL"
    RUNWAY = "RUNWAY"


class BGMode(str, Enum):
    """Background cleanup mode"""
    TRANSPARENT = "transparent"
    SOFTEN = "soften"


@dataclass
class BackgroundClientConfig:
    """Configuration for background client"""
    base_url: str = "http://localhost:8089"
    timeout: int = 300  # 5 minutes
    retry_attempts: int = 3
    retry_delay: float = 1.0


@dataclass
class BackgroundMetadata:
    """Metadata for background processing results"""
    mode: str  # 'cleanup' or 'replace'
    engine: Optional[str] = None
    out_jpg: Optional[str] = None
    out_png: Optional[str] = None
    mask_path: Optional[str] = None
    processed_at: Optional[str] = None
    prompt: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class BackgroundClientError(Exception):
    """Base exception for background client errors"""
    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.code = code


class BackgroundClient:
    """Client for the background processing service"""
    
    def __init__(self, config: Optional[BackgroundClientConfig] = None):
        self.config = config or BackgroundClientConfig()
        
        # Override from environment variables
        if os.getenv("BACKGROUND_API_URL"):
            self.config.base_url = os.getenv("BACKGROUND_API_URL")
        if os.getenv("BACKGROUND_TIMEOUT"):
            self.config.timeout = int(os.getenv("BACKGROUND_TIMEOUT"))
        
        logger.info(f"Background client initialized with base_url: {self.config.base_url}")
    
    def _make_request(self, endpoint: str, files: Dict, data: Dict) -> Dict[str, Any]:
        """Make HTTP request with retry logic"""
        url = f"{self.config.base_url}{endpoint}"
        
        for attempt in range(self.config.retry_attempts):
            try:
                logger.info(f"Making request to {url} (attempt {attempt + 1}/{self.config.retry_attempts})")
                
                response = requests.post(
                    url,
                    files=files,
                    data=data,
                    timeout=self.config.timeout
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success"):
                        logger.info(f"Request successful: {result.get('message')}")
                        return result
                    else:
                        raise BackgroundClientError(
                            result.get("error", "Unknown error"),
                            "PROCESSING_FAILED"
                        )
                else:
                    error_text = response.text
                    raise BackgroundClientError(
                        f"HTTP {response.status_code}: {error_text}",
                        "HTTP_ERROR"
                    )
                    
            except requests.exceptions.Timeout:
                logger.warning(f"Request timeout on attempt {attempt + 1}")
                if attempt == self.config.retry_attempts - 1:
                    raise BackgroundClientError("Request timed out", "TIMEOUT")
                    
            except requests.exceptions.ConnectionError:
                logger.warning(f"Connection error on attempt {attempt + 1}")
                if attempt == self.config.retry_attempts - 1:
                    raise BackgroundClientError("Connection failed", "CONNECTION_ERROR")
                    
            except BackgroundClientError:
                raise
                
            except Exception as e:
                logger.warning(f"Unexpected error on attempt {attempt + 1}: {e}")
                if attempt == self.config.retry_attempts - 1:
                    raise BackgroundClientError(f"Unexpected error: {str(e)}", "UNKNOWN_ERROR")
            
            # Wait before retry
            if attempt < self.config.retry_attempts - 1:
                time.sleep(self.config.retry_delay * (2 ** attempt))
    
    def cleanup(self, 
                image_path: Union[str, Path],
                mode: BGMode = BGMode.TRANSPARENT,
                blur_radius: Optional[int] = None,
                desaturate_pct: Optional[int] = None,
                enhance_fg: bool = True,
                denoise: bool = False) -> BackgroundMetadata:
        """Clean up image background"""
        
        image_path = Path(image_path)
        if not image_path.exists():
            raise BackgroundClientError(f"Image file not found: {image_path}", "FILE_NOT_FOUND")
        
        logger.info(f"Starting background cleanup for {image_path} with mode {mode}")
        
        with open(image_path, 'rb') as f:
            files = {'file': (image_path.name, f, 'image/jpeg')}
            data = {
                'mode': mode.value,
                'enhance_fg': enhance_fg,
                'denoise': denoise
            }
            
            if blur_radius is not None:
                data['blur_radius'] = blur_radius
            if desaturate_pct is not None:
                data['desaturate_pct'] = desaturate_pct
            
            result = self._make_request('/background/cleanup', files, data)
        
        metadata = BackgroundMetadata(
            mode='cleanup',
            out_jpg=result.get('output_path'),
            processed_at=time.strftime('%Y-%m-%dT%H:%M:%S'),
            settings={
                'mode': mode.value,
                'blur_radius': blur_radius,
                'desaturate_pct': desaturate_pct,
                'enhance_fg': enhance_fg,
                'denoise': denoise
            }
        )
        
        logger.info(f"Background cleanup completed: {metadata.out_jpg}")
        return metadata
    
    def replace(self,
                image_path: Union[str, Path],
                prompt: str,
                negative_prompt: str = "people, text, watermark",
                engine: Optional[BGEngine] = None,
                steps: int = 20,
                guidance_scale: float = 7.5,
                seed: Optional[int] = None,
                enhance_fg: bool = True,
                match_colors: bool = True,
                feather_edges: bool = True) -> BackgroundMetadata:
        """Replace image background with AI-generated content"""
        
        image_path = Path(image_path)
        if not image_path.exists():
            raise BackgroundClientError(f"Image file not found: {image_path}", "FILE_NOT_FOUND")
        
        if not prompt.strip():
            raise BackgroundClientError("Prompt is required", "MISSING_PROMPT")
        
        logger.info(f"Starting background replacement for {image_path} with prompt: '{prompt}'")
        
        with open(image_path, 'rb') as f:
            files = {'file': (image_path.name, f, 'image/jpeg')}
            data = {
                'prompt': prompt,
                'negative_prompt': negative_prompt,
                'steps': steps,
                'guidance_scale': guidance_scale,
                'enhance_fg': enhance_fg,
                'match_colors': match_colors,
                'feather_edges': feather_edges
            }
            
            if engine:
                data['engine'] = engine.value
            if seed is not None:
                data['seed'] = seed
            
            result = self._make_request('/background/replace', files, data)
        
        metadata = BackgroundMetadata(
            mode='replace',
            engine=engine.value if engine else None,
            out_jpg=result.get('output_path'),
            processed_at=time.strftime('%Y-%m-%dT%H:%M:%S'),
            prompt=prompt,
            settings={
                'negative_prompt': negative_prompt,
                'steps': steps,
                'guidance_scale': guidance_scale,
                'seed': seed,
                'enhance_fg': enhance_fg,
                'match_colors': match_colors,
                'feather_edges': feather_edges
            }
        )
        
        logger.info(f"Background replacement completed: {metadata.out_jpg}")
        return metadata
    
    def is_healthy(self) -> bool:
        """Check if the background service is healthy"""
        try:
            response = requests.get(f"{self.config.base_url}/health", timeout=5)
            return response.status_code == 200
        except Exception:
            return False
    
    def get_status(self) -> Dict[str, str]:
        """Get service status"""
        response = requests.get(f"{self.config.base_url}/health", timeout=5)
        response.raise_for_status()
        return response.json()


# Brand presets for automated processing
BRAND_PRESETS = {
    "vitrinealu": {
        "prompts": {
            "garden": "modern minimalist garden with soft natural lighting, clean architectural lines, contemporary outdoor space",
            "studio": "professional photography studio with soft diffused lighting, neutral gray backdrop, clean minimal setup",
            "minimal": "clean white minimalist background with soft shadow, product photography style, professional lighting",
            "lifestyle": "modern living space with natural light, contemporary interior design, soft neutral colors"
        },
        "negative_prompt": "people, faces, text, watermark, cluttered, busy, dark, harsh shadows, oversaturated",
        "settings": {
            "steps": 25,
            "guidance_scale": 7.5,
            "engine": BGEngine.SDXL
        }
    }
}


def create_client(config: Optional[BackgroundClientConfig] = None) -> BackgroundClient:
    """Create a background client instance"""
    return BackgroundClient(config)