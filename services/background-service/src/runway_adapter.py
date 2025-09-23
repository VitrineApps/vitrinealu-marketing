"""Runway ML adapter for background generation."""

import requests
import time
import base64
import io
import numpy as np
import cv2
from PIL import Image
from typing import Optional, Dict, Any

from .logger import log
from .config import settings


class RunwayAdapter:
    """Adapter for Runway ML image generation."""
    
    def __init__(self):
        """Initialize Runway adapter."""
        self.api_key = settings.runway_api_key
        self.base_url = "https://api.runwayml.com/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def is_available(self) -> bool:
        """Check if Runway API is available."""
        return bool(self.api_key)
    
    def _encode_image_to_base64(self, image: np.ndarray) -> str:
        """
        Encode numpy image to base64 string.
        
        Args:
            image: Image as numpy array (BGR)
            
        Returns:
            Base64 encoded image string
        """
        # Convert BGR to RGB
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(rgb_image)
        
        # Encode to base64
        buffer = io.BytesIO()
        pil_image.save(buffer, format="JPEG", quality=95)
        encoded_string = base64.b64encode(buffer.getvalue()).decode()
        
        return encoded_string
    
    def _decode_base64_to_image(self, base64_string: str) -> np.ndarray:
        """
        Decode base64 string to numpy image.
        
        Args:
            base64_string: Base64 encoded image
            
        Returns:
            Image as numpy array (BGR)
        """
        # Decode base64
        image_data = base64.b64decode(base64_string)
        pil_image = Image.open(io.BytesIO(image_data))
        
        # Convert to BGR numpy array
        rgb_array = np.array(pil_image)
        bgr_array = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
        
        return bgr_array
    
    def _submit_generation_task(self,
                               prompt: str,
                               negative_prompt: str = "",
                               width: int = 1024,
                               height: int = 1024,
                               steps: int = 25,
                               guidance_scale: float = 7.5,
                               seed: Optional[int] = None) -> str:
        """
        Submit background generation task to Runway.
        
        Args:
            prompt: Generation prompt
            negative_prompt: Negative prompt
            width: Output width
            height: Output height
            steps: Number of inference steps
            guidance_scale: Guidance scale
            seed: Random seed
            
        Returns:
            Task ID
        """
        try:
            payload = {
                "model": "gen3a_turbo",
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "width": width,
                "height": height,
                "num_inference_steps": steps,
                "guidance_scale": guidance_scale
            }
            
            if seed is not None:
                payload["seed"] = seed
            
            log.info(f"Submitting Runway generation task: '{prompt}'")
            
            response = requests.post(
                f"{self.base_url}/images/generate",
                headers=self.headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code != 200:
                raise RuntimeError(f"Runway API error: {response.status_code} - {response.text}")
            
            result = response.json()
            task_id = result.get("id")
            
            if not task_id:
                raise RuntimeError("No task ID returned from Runway API")
            
            log.info(f"Runway task submitted: {task_id}")
            return task_id
            
        except Exception as e:
            log.error(f"Failed to submit Runway task: {e}")
            raise
    
    def _poll_task_status(self, task_id: str, max_wait_time: int = 300) -> Dict[str, Any]:
        """
        Poll task status until completion.
        
        Args:
            task_id: Task ID to poll
            max_wait_time: Maximum wait time in seconds
            
        Returns:
            Task result data
        """
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            try:
                response = requests.get(
                    f"{self.base_url}/tasks/{task_id}",
                    headers=self.headers,
                    timeout=10
                )
                
                if response.status_code != 200:
                    raise RuntimeError(f"Failed to poll task: {response.status_code}")
                
                result = response.json()
                status = result.get("status")
                
                if status == "SUCCEEDED":
                    log.info(f"Runway task completed: {task_id}")
                    return result
                elif status == "FAILED":
                    error_msg = result.get("failure_reason", "Unknown error")
                    raise RuntimeError(f"Runway task failed: {error_msg}")
                elif status in ["PENDING", "RUNNING"]:
                    log.debug(f"Task {task_id} status: {status}")
                    time.sleep(2)
                    continue
                else:
                    log.warning(f"Unknown task status: {status}")
                    time.sleep(2)
                    continue
                    
            except requests.RequestException as e:
                log.warning(f"Polling error: {e}, retrying...")
                time.sleep(5)
                continue
        
        raise TimeoutError(f"Task {task_id} did not complete within {max_wait_time} seconds")
    
    def generate_background(self,
                           prompt: str,
                           negative_prompt: str = "people, text, watermark",
                           width: int = 1024,
                           height: int = 1024,
                           steps: int = 25,
                           guidance_scale: float = 7.5,
                           seed: Optional[int] = None,
                           max_wait_time: int = 300) -> np.ndarray:
        """
        Generate background image using Runway ML.
        
        Args:
            prompt: Generation prompt
            negative_prompt: Negative prompt
            width: Output width
            height: Output height
            steps: Number of inference steps
            guidance_scale: Guidance scale
            seed: Random seed
            max_wait_time: Maximum wait time in seconds
            
        Returns:
            Generated image as numpy array (BGR)
        """
        if not self.is_available():
            raise RuntimeError("Runway API key not configured")
        
        try:
            # Submit task
            task_id = self._submit_generation_task(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=width,
                height=height,
                steps=steps,
                guidance_scale=guidance_scale,
                seed=seed
            )
            
            # Poll for completion
            result = self._poll_task_status(task_id, max_wait_time)
            
            # Extract image from result
            output_data = result.get("output", {})
            image_data = output_data.get("image")
            
            if not image_data:
                raise RuntimeError("No image data in Runway response")
            
            # Decode image
            generated_image = self._decode_base64_to_image(image_data)
            
            log.info("Runway background generation complete")
            return generated_image
            
        except Exception as e:
            log.error(f"Runway generation failed: {e}")
            raise


# Global adapter instance
_runway_adapter = None


def get_runway_adapter() -> RunwayAdapter:
    """Get or create the global Runway adapter instance."""
    global _runway_adapter
    
    if _runway_adapter is None:
        _runway_adapter = RunwayAdapter()
    
    return _runway_adapter


def generate_background_runway(prompt: str,
                              negative_prompt: str = "people, text, watermark",
                              width: int = 1024,
                              height: int = 1024,
                              steps: int = 25,
                              guidance_scale: float = 7.5,
                              seed: Optional[int] = None,
                              max_wait_time: int = 300) -> np.ndarray:
    """
    Convenience function to generate background using Runway ML.
    
    Args:
        prompt: Generation prompt
        negative_prompt: Negative prompt
        width: Output width
        height: Output height
        steps: Number of inference steps
        guidance_scale: Guidance scale
        seed: Random seed
        max_wait_time: Maximum wait time in seconds
        
    Returns:
        Generated image as numpy array (BGR)
    """
    adapter = get_runway_adapter()
    return adapter.generate_background(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        steps=steps,
        guidance_scale=guidance_scale,
        seed=seed,
        max_wait_time=max_wait_time
    )