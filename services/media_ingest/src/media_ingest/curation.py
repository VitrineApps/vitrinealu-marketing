"""Image curation engine with aesthetic scoring, quality checks, and duplicate detection"""

import hashlib
from pathlib import Path
from typing import Dict, Optional, Tuple

import cv2
import numpy as np
import torch
from imagehash import dhash
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from .config import config


class CurationEngine:
    """Engine for scoring and filtering images"""

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Load CLIP model for aesthetic scoring
        self.clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(self.device)
        self.clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

        # Simple aesthetic linear head (placeholder - would need trained weights)
        self.aesthetic_head = torch.nn.Linear(512, 1).to(self.device)
        # TODO: Load trained weights for aesthetic scoring

        # Duplicate detection
        self.seen_hashes = set()

    def score_image(self, image_path: Path) -> Dict[str, float]:
        """Score an image on multiple criteria"""
        # Load image
        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Could not load image: {image_path}")

        pil_image = Image.open(image_path)

        scores = {}

        # Aesthetic score
        scores['aesthetic'] = self._score_aesthetic(pil_image)

        # Technical quality scores
        scores['sharpness'] = self._score_sharpness(image)
        scores['exposure'] = self._score_exposure(image)
        scores['blur'] = self._score_blur(image)

        return scores

    def _score_aesthetic(self, pil_image: Image.Image) -> float:
        """Score image aesthetics using CLIP + linear head"""
        try:
            inputs = self.clip_processor(images=pil_image, return_tensors="pt").to(self.device)
            with torch.no_grad():
                features = self.clip_model.get_image_features(**inputs)
                score = self.aesthetic_head(features).sigmoid().item()
            return score
        except Exception as e:
            print(f"Error scoring aesthetics: {e}")
            return 0.5  # Neutral score on error

    def _score_sharpness(self, image: np.ndarray) -> float:
        """Score image sharpness using Laplacian variance"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return cv2.Laplacian(gray, cv2.CV_64F).var()

    def _score_exposure(self, image: np.ndarray) -> float:
        """Score image exposure based on histogram distribution"""
        # Convert to grayscale for histogram
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Calculate histogram
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        hist = hist.flatten() / hist.sum()  # Normalize

        # Score based on how well distributed the histogram is
        # Good exposure has peaks in middle ranges
        mid_range = hist[64:192]  # Middle 50% of intensity range
        score = mid_range.sum()

        # Penalize if too much in dark or bright areas
        dark_pixels = hist[:32].sum()
        bright_pixels = hist[224:].sum()

        score = score - (dark_pixels + bright_pixels) * 0.5
        return max(0.0, min(1.0, score))

    def _score_blur(self, image: np.ndarray) -> float:
        """Score image blur (higher = sharper, less blur)"""
        return self._score_sharpness(image)  # Same as sharpness for now

    def compute_perceptual_hash(self, image_path: Path) -> str:
        """Compute perceptual hash for duplicate detection"""
        pil_image = Image.open(image_path)
        hash_obj = dhash(pil_image)
        return str(hash_obj)

    def is_duplicate(self, hash1: str, hash2: str, threshold: int = None) -> bool:
        """Check if two hashes represent duplicates"""
        if threshold is None:
            threshold = config.duplicate_hamming_threshold

        h1 = int(hash1, 16)
        h2 = int(hash2, 16)

        # Calculate Hamming distance
        distance = bin(h1 ^ h2).count('1')
        return distance <= threshold

    def should_keep_image(self, scores: Dict[str, float]) -> Tuple[bool, list]:
        """Decide whether to keep an image based on scores"""
        reasons = []

        # Check aesthetic threshold
        if scores.get('aesthetic', 0) < config.aesthetic_threshold:
            reasons.append(f"aesthetic score {scores['aesthetic']:.3f} < {config.aesthetic_threshold}")

        # Check sharpness
        if scores.get('sharpness', 0) < config.sharpness_threshold:
            reasons.append(f"sharpness {scores['sharpness']:.1f} < {config.sharpness_threshold}")

        # Check exposure (arbitrary threshold)
        if scores.get('exposure', 0) < 0.3:
            reasons.append(f"poor exposure {scores['exposure']:.3f}")

        kept = len(reasons) == 0
        return kept, reasons

    def check_duplicate(self, image_hash: str) -> bool:
        """Check if image is a duplicate of previously seen images"""
        for seen_hash in self.seen_hashes:
            if self.is_duplicate(image_hash, seen_hash):
                return True
        self.seen_hashes.add(image_hash)
        return False


# Global curation engine instance
curation_engine = CurationEngine()