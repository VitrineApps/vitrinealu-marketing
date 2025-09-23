"""I/O utilities for image loading, saving, and validation."""

import hashlib
from pathlib import Path
from typing import Tuple, Optional
import numpy as np
from PIL import Image, ImageOps
import cv2

from .logger import log


def load_image(image_path: str) -> Tuple[np.ndarray, Image.Image]:
    """
    Load an image from path and return both OpenCV and PIL formats.
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Tuple of (opencv_image, pil_image)
    """
    try:
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
            
        # Load with PIL first for EXIF handling
        pil_image = Image.open(path)
        
        # Handle EXIF orientation
        pil_image = ImageOps.exif_transpose(pil_image)
        
        # Convert to RGB if needed
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
            
        # Convert to OpenCV format (BGR)
        cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        
        log.info(f"Loaded image: {path.name} ({pil_image.size[0]}x{pil_image.size[1]})")
        return cv_image, pil_image
        
    except Exception as e:
        log.error(f"Failed to load image {image_path}: {e}")
        raise


def save_image_png(image: np.ndarray, output_path: str, mask: Optional[np.ndarray] = None) -> str:
    """
    Save image as PNG, optionally with alpha channel from mask.
    
    Args:
        image: BGR image array
        output_path: Output file path
        mask: Optional mask for alpha channel (255 = opaque, 0 = transparent)
        
    Returns:
        Path to saved file
    """
    try:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        # Convert BGR to RGB
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        if mask is not None:
            # Create RGBA image
            rgba_image = np.dstack([rgb_image, mask])
            pil_image = Image.fromarray(rgba_image, 'RGBA')
        else:
            pil_image = Image.fromarray(rgb_image, 'RGB')
            
        pil_image.save(str(path), 'PNG', optimize=True)
        log.info(f"Saved PNG: {path.name}")
        return str(path)
        
    except Exception as e:
        log.error(f"Failed to save PNG {output_path}: {e}")
        raise


def save_image_jpg(image: np.ndarray, output_path: str, quality: int = 95) -> str:
    """
    Save image as JPEG.
    
    Args:
        image: BGR image array
        output_path: Output file path
        quality: JPEG quality (1-100)
        
    Returns:
        Path to saved file
    """
    try:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        # Convert BGR to RGB
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(rgb_image, 'RGB')
        
        pil_image.save(str(path), 'JPEG', quality=quality, optimize=True)
        log.info(f"Saved JPEG: {path.name}")
        return str(path)
        
    except Exception as e:
        log.error(f"Failed to save JPEG {output_path}: {e}")
        raise


def save_mask(mask: np.ndarray, output_path: str) -> str:
    """
    Save mask as grayscale PNG.
    
    Args:
        mask: Mask array (0-255)
        output_path: Output file path
        
    Returns:
        Path to saved file
    """
    try:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        pil_image = Image.fromarray(mask, 'L')
        pil_image.save(str(path), 'PNG')
        log.info(f"Saved mask: {path.name}")
        return str(path)
        
    except Exception as e:
        log.error(f"Failed to save mask {output_path}: {e}")
        raise


def generate_output_paths(input_path: str, output_dir: str, suffix: str = "") -> Tuple[str, str, str]:
    """
    Generate output paths for PNG, JPEG, and mask files.
    
    Args:
        input_path: Input image path
        output_dir: Output directory
        suffix: Optional suffix for filenames
        
    Returns:
        Tuple of (png_path, jpg_path, mask_path)
    """
    input_file = Path(input_path)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Generate hash-based filename for uniqueness
    file_hash = hashlib.md5(str(input_file.absolute()).encode()).hexdigest()[:8]
    base_name = f"{input_file.stem}_{file_hash}"
    
    if suffix:
        base_name += f"_{suffix}"
    
    png_path = output_path / f"{base_name}.png"
    jpg_path = output_path / f"{base_name}.jpg"
    mask_path = output_path / f"{base_name}_mask.png"
    
    return str(png_path), str(jpg_path), str(mask_path)


def resize_image(image: np.ndarray, target_size: Tuple[int, int], maintain_aspect: bool = True) -> np.ndarray:
    """
    Resize image to target size.
    
    Args:
        image: Input image
        target_size: (width, height)
        maintain_aspect: Whether to maintain aspect ratio
        
    Returns:
        Resized image
    """
    if maintain_aspect:
        h, w = image.shape[:2]
        target_w, target_h = target_size
        
        # Calculate scaling factor
        scale = min(target_w / w, target_h / h)
        new_w, new_h = int(w * scale), int(h * scale)
        
        # Resize and pad if necessary
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        
        if new_w != target_w or new_h != target_h:
            # Pad to target size
            if len(image.shape) == 3:
                padded = np.zeros((target_h, target_w, image.shape[2]), dtype=image.dtype)
            else:
                padded = np.zeros((target_h, target_w), dtype=image.dtype)
                
            y_offset = (target_h - new_h) // 2
            x_offset = (target_w - new_w) // 2
            
            if len(image.shape) == 3:
                padded[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = resized
            else:
                padded[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = resized
                
            return padded
        else:
            return resized
    else:
        return cv2.resize(image, target_size, interpolation=cv2.INTER_LANCZOS4)