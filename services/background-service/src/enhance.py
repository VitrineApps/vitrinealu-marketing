"""Background cleanup and enhancement operations."""

import numpy as np
import cv2
from typing import Tuple

from .logger import log


def cleanup_background_transparent(image: np.ndarray, mask: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Remove background completely, making it transparent.
    
    Args:
        image: Input image in BGR format
        mask: Foreground mask (255 = foreground, 0 = background)
        
    Returns:
        Tuple of (cleaned_image, alpha_mask)
    """
    try:
        log.info("Cleaning background with transparent mode")
        
        # Apply mask to image
        cleaned = image.copy()
        alpha_mask = mask.copy()
        
        # Set background pixels to black (will be transparent in PNG)
        background_mask = mask == 0
        cleaned[background_mask] = [0, 0, 0]  # BGR black
        
        log.info("Background cleanup (transparent) complete")
        return cleaned, alpha_mask
        
    except Exception as e:
        log.error(f"Failed to cleanup background (transparent): {e}")
        raise


def cleanup_background_soften(image: np.ndarray, 
                              mask: np.ndarray,
                              blur_radius: int = 8,
                              desaturate_pct: int = 25) -> Tuple[np.ndarray, np.ndarray]:
    """
    Soften background by blurring and desaturating while preserving foreground.
    
    Args:
        image: Input image in BGR format
        mask: Foreground mask (255 = foreground, 0 = background)
        blur_radius: Gaussian blur radius for background
        desaturate_pct: Desaturation percentage (0-100)
        
    Returns:
        Tuple of (cleaned_image, alpha_mask)
    """
    try:
        log.info(f"Cleaning background with soften mode (blur={blur_radius}, desaturate={desaturate_pct}%)")
        
        # Create smooth transition mask
        smooth_mask = cv2.GaussianBlur(mask.astype(np.float32), (21, 21), 0) / 255.0
        smooth_mask = np.clip(smooth_mask, 0, 1)
        
        # Create blurred version of entire image
        kernel_size = blur_radius * 2 + 1
        blurred = cv2.GaussianBlur(image, (kernel_size, kernel_size), 0)
        
        # Desaturate background
        if desaturate_pct > 0:
            # Convert to LAB for better desaturation
            lab = cv2.cvtColor(blurred, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            
            # Reduce chrominance channels
            factor = 1.0 - (desaturate_pct / 100.0)
            a = (a.astype(np.float32) - 128) * factor + 128
            b = (b.astype(np.float32) - 128) * factor + 128
            
            # Clamp values
            a = np.clip(a, 0, 255).astype(np.uint8)
            b = np.clip(b, 0, 255).astype(np.uint8)
            
            # Merge back
            lab_desaturated = cv2.merge([l, a, b])
            blurred = cv2.cvtColor(lab_desaturated, cv2.COLOR_LAB2BGR)
        
        # Blend original foreground with processed background
        cleaned = image.copy().astype(np.float32)
        blurred_float = blurred.astype(np.float32)
        
        for c in range(3):  # BGR channels
            cleaned[:, :, c] = (smooth_mask * cleaned[:, :, c] + 
                               (1 - smooth_mask) * blurred_float[:, :, c])
        
        cleaned = np.clip(cleaned, 0, 255).astype(np.uint8)
        
        # Create alpha mask (full opacity for this mode)
        alpha_mask = np.full(mask.shape, 255, dtype=np.uint8)
        
        log.info("Background cleanup (soften) complete")
        return cleaned, alpha_mask
        
    except Exception as e:
        log.error(f"Failed to cleanup background (soften): {e}")
        raise


def enhance_foreground(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Apply subtle enhancements to the foreground.
    
    Args:
        image: Input image in BGR format
        mask: Foreground mask
        
    Returns:
        Enhanced image
    """
    try:
        log.info("Applying foreground enhancements")
        
        enhanced = image.copy()
        
        # Create foreground-only region
        foreground_mask = (mask > 128).astype(np.float32)
        
        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to foreground
        lab = cv2.cvtColor(enhanced, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        # Apply CLAHE to L channel
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)
        
        # Blend enhanced L channel only in foreground regions
        l_blended = (foreground_mask * l_clahe + (1 - foreground_mask) * l).astype(np.uint8)
        
        # Merge back
        lab_enhanced = cv2.merge([l_blended, a, b])
        enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
        
        # Apply subtle sharpening to foreground
        kernel = np.array([[-1, -1, -1],
                          [-1,  9, -1],
                          [-1, -1, -1]])
        sharpened = cv2.filter2D(enhanced, -1, kernel)
        
        # Blend sharpened version only in foreground
        for c in range(3):
            enhanced[:, :, c] = (foreground_mask * sharpened[:, :, c] + 
                                (1 - foreground_mask) * enhanced[:, :, c]).astype(np.uint8)
        
        log.info("Foreground enhancement complete")
        return enhanced
        
    except Exception as e:
        log.error(f"Failed to enhance foreground: {e}")
        return image


def denoise_image(image: np.ndarray, strength: int = 10) -> np.ndarray:
    """
    Apply light denoising to the image.
    
    Args:
        image: Input image in BGR format
        strength: Denoising strength (higher = more denoising)
        
    Returns:
        Denoised image
    """
    try:
        log.info(f"Applying denoising (strength={strength})")
        
        # Use Non-local Means Denoising
        denoised = cv2.fastNlMeansDenoisingColored(image, None, strength, strength, 7, 21)
        
        log.info("Denoising complete")
        return denoised
        
    except Exception as e:
        log.error(f"Failed to denoise image: {e}")
        return image