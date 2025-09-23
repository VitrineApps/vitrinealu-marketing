"""Foreground masking and segmentation using rembg and OpenCV."""

import numpy as np
import cv2
from PIL import Image
from rembg import remove
from typing import Tuple, Optional

from .logger import log


def extract_foreground_mask(image: np.ndarray, model_name: str = "u2net") -> Tuple[np.ndarray, np.ndarray]:
    """
    Extract foreground mask using rembg.
    
    Args:
        image: Input image in BGR format
        model_name: rembg model to use ('u2net', 'u2net_human_seg', 'silueta', etc.)
        
    Returns:
        Tuple of (foreground_rgba, mask)
    """
    try:
        log.info(f"Extracting foreground mask using {model_name}")
        
        # Convert BGR to RGB for rembg
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(rgb_image)
        
        # Remove background
        result = remove(pil_image, model_name=model_name)
        
        # Convert result to numpy array
        result_array = np.array(result)
        
        if result_array.shape[2] == 4:  # RGBA
            # Extract alpha channel as mask
            mask = result_array[:, :, 3]
            # Convert RGB to BGR for consistency
            foreground_bgr = cv2.cvtColor(result_array[:, :, :3], cv2.COLOR_RGB2BGR)
            foreground_rgba = np.dstack([foreground_bgr, mask])
        else:  # RGB
            # Create mask from non-black pixels
            gray = cv2.cvtColor(result_array, cv2.COLOR_RGB2GRAY)
            mask = (gray > 10).astype(np.uint8) * 255
            foreground_bgr = cv2.cvtColor(result_array, cv2.COLOR_RGB2BGR)
            foreground_rgba = np.dstack([foreground_bgr, mask])
        
        log.info(f"Foreground extraction complete. Mask coverage: {np.sum(mask > 0) / mask.size * 100:.1f}%")
        return foreground_rgba, mask
        
    except Exception as e:
        log.error(f"Failed to extract foreground mask: {e}")
        raise


def refine_mask(mask: np.ndarray, 
                morph_kernel_size: int = 3,
                close_iterations: int = 2,
                open_iterations: int = 1,
                blur_radius: int = 1) -> np.ndarray:
    """
    Refine mask using morphological operations and blurring.
    
    Args:
        mask: Input binary mask
        morph_kernel_size: Size of morphological kernel
        close_iterations: Number of closing operations
        open_iterations: Number of opening operations
        blur_radius: Gaussian blur radius for edge softening
        
    Returns:
        Refined mask
    """
    try:
        log.info("Refining mask with morphological operations")
        
        # Create morphological kernel
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (morph_kernel_size, morph_kernel_size))
        
        # Fill holes with closing
        refined = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=close_iterations)
        
        # Remove noise with opening
        refined = cv2.morphologyEx(refined, cv2.MORPH_OPEN, kernel, iterations=open_iterations)
        
        # Soften edges with gaussian blur
        if blur_radius > 0:
            refined = cv2.GaussianBlur(refined, (blur_radius * 2 + 1, blur_radius * 2 + 1), 0)
        
        return refined
        
    except Exception as e:
        log.error(f"Failed to refine mask: {e}")
        raise


def create_face_preserve_region(image: np.ndarray, face_cascade_path: Optional[str] = None) -> Optional[np.ndarray]:
    """
    Detect faces and create a preservation mask.
    
    Args:
        image: Input image in BGR format
        face_cascade_path: Path to OpenCV face cascade XML file
        
    Returns:
        Face preservation mask or None if no faces detected
    """
    try:
        # Use default OpenCV face cascade if none provided
        if face_cascade_path is None:
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        else:
            face_cascade = cv2.CascadeClassifier(face_cascade_path)
        
        if face_cascade.empty():
            log.warning("Could not load face cascade")
            return None
        
        # Convert to grayscale for face detection
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )
        
        if len(faces) == 0:
            log.info("No faces detected")
            return None
        
        # Create face preservation mask
        h, w = image.shape[:2]
        face_mask = np.zeros((h, w), dtype=np.uint8)
        
        for (x, y, face_w, face_h) in faces:
            # Expand face region slightly
            expand_factor = 1.3
            center_x, center_y = x + face_w // 2, y + face_h // 2
            expanded_w = int(face_w * expand_factor)
            expanded_h = int(face_h * expand_factor)
            
            x1 = max(0, center_x - expanded_w // 2)
            y1 = max(0, center_y - expanded_h // 2)
            x2 = min(w, center_x + expanded_w // 2)
            y2 = min(h, center_y + expanded_h // 2)
            
            # Create elliptical face mask
            cv2.ellipse(face_mask, (center_x, center_y), (expanded_w // 2, expanded_h // 2), 0, 0, 360, 255, -1)
        
        # Blur face mask for smooth transitions
        face_mask = cv2.GaussianBlur(face_mask, (21, 21), 0)
        
        log.info(f"Created face preservation mask for {len(faces)} face(s)")
        return face_mask
        
    except Exception as e:
        log.error(f"Failed to create face preserve region: {e}")
        return None


def combine_masks(primary_mask: np.ndarray, 
                  face_mask: Optional[np.ndarray] = None,
                  face_weight: float = 0.8) -> np.ndarray:
    """
    Combine foreground mask with face preservation mask.
    
    Args:
        primary_mask: Main foreground mask
        face_mask: Optional face preservation mask
        face_weight: Weight for face preservation (0-1)
        
    Returns:
        Combined mask
    """
    if face_mask is None:
        return primary_mask
    
    try:
        # Normalize masks to 0-1 range
        primary_norm = primary_mask.astype(np.float32) / 255.0
        face_norm = face_mask.astype(np.float32) / 255.0
        
        # Combine masks with weighted maximum
        combined = np.maximum(primary_norm, face_norm * face_weight)
        
        # Convert back to 0-255 range
        combined_mask = (combined * 255).astype(np.uint8)
        
        log.info("Combined foreground and face preservation masks")
        return combined_mask
        
    except Exception as e:
        log.error(f"Failed to combine masks: {e}")
        return primary_mask


def extract_refined_foreground(image: np.ndarray, 
                               model_name: str = "u2net",
                               refine: bool = True,
                               preserve_faces: bool = True) -> Tuple[np.ndarray, np.ndarray]:
    """
    Complete foreground extraction pipeline.
    
    Args:
        image: Input image in BGR format
        model_name: rembg model name
        refine: Whether to apply morphological refinement
        preserve_faces: Whether to detect and preserve face regions
        
    Returns:
        Tuple of (foreground_rgba, final_mask)
    """
    try:
        log.info("Starting complete foreground extraction pipeline")
        
        # Extract initial foreground and mask
        foreground_rgba, initial_mask = extract_foreground_mask(image, model_name)
        
        # Refine mask if requested
        if refine:
            refined_mask = refine_mask(initial_mask)
        else:
            refined_mask = initial_mask
        
        # Create face preservation mask if requested
        face_mask = None
        if preserve_faces:
            face_mask = create_face_preserve_region(image)
        
        # Combine masks
        final_mask = combine_masks(refined_mask, face_mask)
        
        # Apply final mask to foreground
        foreground_bgr = foreground_rgba[:, :, :3]
        final_foreground = np.dstack([foreground_bgr, final_mask])
        
        log.info("Foreground extraction pipeline complete")
        return final_foreground, final_mask
        
    except Exception as e:
        log.error(f"Failed in foreground extraction pipeline: {e}")
        raise