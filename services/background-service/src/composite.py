"""Image compositing with color matching and blending."""

import cv2
import numpy as np
from typing import Tuple, Optional
from scipy.stats import pearsonr

from .logger import log


def extract_histogram_features(image: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Extract color histogram features from an image.
    
    Args:
        image: Input image (BGR)
        mask: Optional mask to limit extraction area
        
    Returns:
        Histogram features as flattened array
    """
    try:
        # Convert to LAB color space for better color matching
        lab_image = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        
        # Calculate histograms for each channel
        hist_l = cv2.calcHist([lab_image], [0], mask, [32], [0, 256])
        hist_a = cv2.calcHist([lab_image], [1], mask, [32], [0, 256])
        hist_b = cv2.calcHist([lab_image], [2], mask, [32], [0, 256])
        
        # Normalize histograms
        hist_l = cv2.normalize(hist_l, hist_l).flatten()
        hist_a = cv2.normalize(hist_a, hist_a).flatten()
        hist_b = cv2.normalize(hist_b, hist_b).flatten()
        
        # Concatenate all features
        features = np.concatenate([hist_l, hist_a, hist_b])
        
        return features
        
    except Exception as e:
        log.error(f"Failed to extract histogram features: {e}")
        raise


def match_color_histograms(source: np.ndarray, 
                          target: np.ndarray,
                          source_mask: Optional[np.ndarray] = None,
                          target_mask: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Match color histograms between source and target images.
    
    Args:
        source: Source image to adjust (BGR)
        target: Target image to match (BGR)
        source_mask: Optional mask for source image
        target_mask: Optional mask for target image
        
    Returns:
        Color-matched source image
    """
    try:
        # Convert to LAB color space
        source_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
        target_lab = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(np.float32)
        
        # Process each channel
        matched_lab = source_lab.copy()
        
        for i in range(3):
            source_channel = source_lab[:, :, i]
            target_channel = target_lab[:, :, i]
            
            # Calculate statistics for each channel
            if source_mask is not None:
                source_mean = np.mean(source_channel[source_mask > 0])
                source_std = np.std(source_channel[source_mask > 0])
            else:
                source_mean = np.mean(source_channel)
                source_std = np.std(source_channel)
            
            if target_mask is not None:
                target_mean = np.mean(target_channel[target_mask > 0])
                target_std = np.std(target_channel[target_mask > 0])
            else:
                target_mean = np.mean(target_channel)
                target_std = np.std(target_channel)
            
            # Avoid division by zero
            if source_std > 0:
                # Match statistics
                matched_channel = (source_channel - source_mean) * (target_std / source_std) + target_mean
                matched_lab[:, :, i] = matched_channel
        
        # Convert back to BGR
        matched_lab = np.clip(matched_lab, 0, 255).astype(np.uint8)
        matched_bgr = cv2.cvtColor(matched_lab, cv2.COLOR_LAB2BGR)
        
        log.info("Color histogram matching complete")
        return matched_bgr
        
    except Exception as e:
        log.error(f"Failed to match color histograms: {e}")
        raise


def transfer_color_statistics(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    """
    Transfer color statistics from target to source using Reinhard's method.
    
    Args:
        source: Source image to adjust (BGR)
        target: Target image to match (BGR)
        
    Returns:
        Color-transferred source image
    """
    try:
        # Convert to LAB color space
        source_lab = cv2.cvtColor(source, cv2.COLOR_BGR2LAB).astype(np.float32)
        target_lab = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(np.float32)
        
        # Calculate mean and standard deviation for each channel
        source_mean = np.mean(source_lab, axis=(0, 1))
        source_std = np.std(source_lab, axis=(0, 1))
        target_mean = np.mean(target_lab, axis=(0, 1))
        target_std = np.std(target_lab, axis=(0, 1))
        
        # Transfer statistics
        result = source_lab.copy()
        for i in range(3):
            if source_std[i] > 0:
                result[:, :, i] = (source_lab[:, :, i] - source_mean[i]) * (target_std[i] / source_std[i]) + target_mean[i]
        
        # Convert back to BGR
        result = np.clip(result, 0, 255).astype(np.uint8)
        result_bgr = cv2.cvtColor(result, cv2.COLOR_LAB2BGR)
        
        log.info("Color statistics transfer complete")
        return result_bgr
        
    except Exception as e:
        log.error(f"Failed to transfer color statistics: {e}")
        raise


def blend_edges(foreground: np.ndarray, 
                background: np.ndarray, 
                mask: np.ndarray,
                feather_size: int = 5) -> np.ndarray:
    """
    Blend edges between foreground and background using feathering.
    
    Args:
        foreground: Foreground image (BGR)
        background: Background image (BGR)
        mask: Foreground mask
        feather_size: Size of feathering kernel
        
    Returns:
        Blended composite image
    """
    try:
        # Create feathered mask
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (feather_size, feather_size))
        feathered_mask = cv2.morphologyEx(mask, cv2.MORPH_GRADIENT, kernel)
        feathered_mask = cv2.GaussianBlur(feathered_mask, (feather_size, feather_size), 0)
        
        # Normalize mask to 0-1 range
        mask_norm = mask.astype(np.float32) / 255.0
        feather_norm = feathered_mask.astype(np.float32) / 255.0
        
        # Combine masks
        combined_mask = np.maximum(mask_norm, feather_norm * 0.5)
        combined_mask = np.clip(combined_mask, 0, 1)
        
        # Expand mask to 3 channels
        mask_3ch = np.stack([combined_mask] * 3, axis=2)
        
        # Blend images
        foreground_f = foreground.astype(np.float32)
        background_f = background.astype(np.float32)
        
        blended = foreground_f * mask_3ch + background_f * (1 - mask_3ch)
        blended = np.clip(blended, 0, 255).astype(np.uint8)
        
        log.info("Edge blending complete")
        return blended
        
    except Exception as e:
        log.error(f"Failed to blend edges: {e}")
        raise


def create_seamless_composite(foreground: np.ndarray,
                             background: np.ndarray,
                             mask: np.ndarray,
                             match_colors: bool = True,
                             feather_edges: bool = True,
                             feather_size: int = 5) -> np.ndarray:
    """
    Create a seamless composite of foreground and background.
    
    Args:
        foreground: Foreground image (BGR)
        background: Background image (BGR)
        mask: Foreground mask
        match_colors: Whether to match colors between foreground and background
        feather_edges: Whether to feather edges for smooth blending
        feather_size: Size of feathering kernel
        
    Returns:
        Seamless composite image
    """
    try:
        log.info("Creating seamless composite")
        
        # Ensure background matches foreground size
        if background.shape[:2] != foreground.shape[:2]:
            background = cv2.resize(background, (foreground.shape[1], foreground.shape[0]))
        
        # Color matching if requested
        if match_colors:
            # Extract background areas for color reference
            background_mask = cv2.bitwise_not(mask)
            
            # Dilate the background mask to get border areas
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (20, 20))
            border_mask = cv2.morphologyEx(background_mask, cv2.MORPH_DILATE, kernel)
            border_mask = cv2.bitwise_and(border_mask, cv2.bitwise_not(mask))
            
            if np.any(border_mask > 0):
                # Match foreground colors to background
                foreground_matched = match_color_histograms(
                    source=foreground,
                    target=background,
                    source_mask=mask,
                    target_mask=border_mask
                )
            else:
                foreground_matched = foreground.copy()
        else:
            foreground_matched = foreground.copy()
        
        # Edge blending if requested
        if feather_edges:
            composite = blend_edges(foreground_matched, background, mask, feather_size)
        else:
            # Simple alpha blending
            mask_norm = mask.astype(np.float32) / 255.0
            mask_3ch = np.stack([mask_norm] * 3, axis=2)
            
            foreground_f = foreground_matched.astype(np.float32)
            background_f = background.astype(np.float32)
            
            composite = foreground_f * mask_3ch + background_f * (1 - mask_3ch)
            composite = np.clip(composite, 0, 255).astype(np.uint8)
        
        log.info("Seamless composite created successfully")
        return composite
        
    except Exception as e:
        log.error(f"Failed to create seamless composite: {e}")
        raise


def adjust_lighting_consistency(composite: np.ndarray, 
                               foreground_mask: np.ndarray,
                               target_brightness: Optional[float] = None) -> np.ndarray:
    """
    Adjust lighting to ensure consistency between foreground and background.
    
    Args:
        composite: Composite image (BGR)
        foreground_mask: Mask of foreground object
        target_brightness: Target brightness value (auto-calculated if None)
        
    Returns:
        Lighting-adjusted composite image
    """
    try:
        log.info("Adjusting lighting consistency")
        
        # Convert to LAB for luminance adjustment
        lab_image = cv2.cvtColor(composite, cv2.COLOR_BGR2LAB).astype(np.float32)
        l_channel = lab_image[:, :, 0]
        
        # Calculate background and foreground brightness
        background_mask = cv2.bitwise_not(foreground_mask)
        
        if np.any(background_mask > 0) and np.any(foreground_mask > 0):
            bg_brightness = np.mean(l_channel[background_mask > 0])
            fg_brightness = np.mean(l_channel[foreground_mask > 0])
            
            # Calculate adjustment factor
            if target_brightness is None:
                target_brightness = bg_brightness
            
            brightness_diff = target_brightness - fg_brightness
            
            # Apply adjustment to foreground areas
            adjustment_mask = foreground_mask.astype(np.float32) / 255.0
            l_channel += brightness_diff * adjustment_mask
            
            # Clip values
            lab_image[:, :, 0] = np.clip(l_channel, 0, 100)
            
            # Convert back to BGR
            adjusted_bgr = cv2.cvtColor(lab_image.astype(np.uint8), cv2.COLOR_LAB2BGR)
            
            log.info(f"Lighting adjusted: brightness difference {brightness_diff:.2f}")
            return adjusted_bgr
        else:
            log.warning("Could not calculate lighting adjustment - insufficient mask data")
            return composite
        
    except Exception as e:
        log.error(f"Failed to adjust lighting consistency: {e}")
        return composite