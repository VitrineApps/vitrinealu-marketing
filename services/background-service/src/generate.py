"""Background generation using SDXL and diffusers."""

import torch
import numpy as np
import cv2
from PIL import Image
from typing import Optional, Tuple
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
import gc

from .logger import log
from .config import settings


class SDXLGenerator:
    """SDXL-based background generator with in-memory cache."""
    def __init__(self):
        self.pipeline = None
        self.device = settings.device
        self.model_id = settings.model_id
        self._load_pipeline()
        # (prompt, negative_prompt, width, height, steps, guidance_scale, seed) -> np.ndarray
        self._cache = {}
    
    def _load_pipeline(self):
        """Load the SDXL pipeline with optimizations."""
        try:
            log.info(f"Loading SDXL pipeline: {self.model_id}")
            
            # Configure torch for low VRAM
            if self.device == "cuda" and torch.cuda.is_available():
                torch.backends.cudnn.benchmark = True
                log.info(f"CUDA available, using GPU. VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB")
            else:
                self.device = "cpu"
                log.info("Using CPU for inference")
            
            # Load pipeline with optimizations
            self.pipeline = StableDiffusionXLPipeline.from_pretrained(
                self.model_id,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                use_safetensors=True,
                variant="fp16" if self.device == "cuda" else None
            )
            
            # Move to device
            self.pipeline = self.pipeline.to(self.device)
            
            # Optimize for low VRAM
            if self.device == "cuda":
                self.pipeline.enable_model_cpu_offload()
                self.pipeline.enable_vae_slicing()
                self.pipeline.enable_attention_slicing(1)
            
            # Use faster scheduler
            self.pipeline.scheduler = DPMSolverMultistepScheduler.from_config(
                self.pipeline.scheduler.config
            )
            
            log.info("SDXL pipeline loaded successfully")
            
        except Exception as e:
            log.error(f"Failed to load SDXL pipeline: {e}")
            self.pipeline = None
            raise
    
    def is_available(self) -> bool:
        """Check if the generator is available."""
        return self.pipeline is not None
    
    def generate_background(self,
                           prompt: str,
                           negative_prompt: str = "people, text, watermark",
                           width: int = 1024,
                           height: int = 1024,
                           steps: int = 20,
                           guidance_scale: float = 7.5,
                           seed: Optional[int] = None) -> np.ndarray:
        """
        Generate background image using SDXL.
        
        Args:
            prompt: Generation prompt
            negative_prompt: Negative prompt
            width: Output width
            height: Output height
            steps: Number of inference steps
            guidance_scale: Guidance scale
            seed: Random seed
            
        Returns:
            Generated image as numpy array (BGR)
        """
        if not self.is_available():
            raise RuntimeError("SDXL pipeline not available")
        
        try:
            cache_key = (prompt, negative_prompt, width, height, steps, guidance_scale, seed)
            if cache_key in self._cache:
                log.info(f"Cache hit for background: {cache_key}")
                return self._cache[cache_key]
            log.info(f"Generating background: '{prompt}' ({width}x{height}, steps={steps})")
            # Set seed if provided
            generator = None
            if seed is not None:
                generator = torch.Generator(device=self.device).manual_seed(seed)
            # Generate image
            with torch.inference_mode():
                result = self.pipeline(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    width=width,
                    height=height,
                    num_inference_steps=steps,
                    guidance_scale=guidance_scale,
                    generator=generator
                )
            # Convert to BGR numpy array
            generated_image = result.images[0]
            bgr_image = cv2.cvtColor(np.array(generated_image), cv2.COLOR_RGB2BGR)
            # Store in cache
            self._cache[cache_key] = bgr_image
            # Clear GPU memory
            if self.device == "cuda":
                torch.cuda.empty_cache()
                gc.collect()
            log.info("Background generation complete")
            return bgr_image
        except Exception as e:
            log.error(f"Failed to generate background: {e}")
            # Clear GPU memory on error
            if self.device == "cuda":
                torch.cuda.empty_cache()
                gc.collect()
            raise
    
    def cleanup(self):
        """Clean up resources."""
        if self.pipeline is not None:
            del self.pipeline
            self.pipeline = None
            
        if self.device == "cuda":
            torch.cuda.empty_cache()
            gc.collect()
        
        log.info("SDXL generator cleaned up")


# Global generator instance
_sdxl_generator = None


def get_sdxl_generator() -> SDXLGenerator:
    """Get or create the global SDXL generator instance."""
    global _sdxl_generator
    
    if _sdxl_generator is None:
        _sdxl_generator = SDXLGenerator()
    
    return _sdxl_generator


def generate_background_sdxl(prompt: str,
                            negative_prompt: str = "people, text, watermark",
                            width: int = 1024,
                            height: int = 1024,
                            steps: int = 20,
                            guidance_scale: float = 7.5,
                            seed: Optional[int] = None) -> np.ndarray:
    """
    Convenience function to generate background using SDXL.
    
    Args:
        prompt: Generation prompt
        negative_prompt: Negative prompt
        width: Output width
        height: Output height
        steps: Number of inference steps
        guidance_scale: Guidance scale
        seed: Random seed
        
    Returns:
        Generated image as numpy array (BGR)
    """
    generator = get_sdxl_generator()
    return generator.generate_background(
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        steps=steps,
        guidance_scale=guidance_scale,
        seed=seed
    )


def resize_background_to_match(background: np.ndarray, target_shape: Tuple[int, int]) -> np.ndarray:
    """
    Resize generated background to match target image dimensions.
    
    Args:
        background: Generated background image
        target_shape: (height, width) of target image
        
    Returns:
        Resized background image
    """
    try:
        target_h, target_w = target_shape
        
        # Resize background to match target dimensions
        resized = cv2.resize(background, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
        
        log.info(f"Resized background from {background.shape[:2]} to {target_shape}")
        return resized
        
    except Exception as e:
        log.error(f"Failed to resize background: {e}")
        raise