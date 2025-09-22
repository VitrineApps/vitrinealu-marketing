"""Face detection and blurring for privacy"""

import cv2
import numpy as np
from pathlib import Path
from typing import Optional

from .config import config


class FaceBlurrer:
    """Detects and blurs faces in images"""

    def __init__(self, model_dir: Optional[str] = None):
        self.model_dir = model_dir or "models"  # Would need actual model files
        self.net: Optional[cv2.dnn.Net] = None
        self._load_model()

    def _load_model(self):
        """Load face detection model"""
        try:
            # SSD MobileNet face detection model paths
            prototxt_path = Path(self.model_dir) / "deploy.prototxt"
            model_path = Path(self.model_dir) / "res10_300x300_ssd_iter_140000.caffemodel"

            if prototxt_path.exists() and model_path.exists():
                self.net = cv2.dnn.readNetFromCaffe(str(prototxt_path), str(model_path))
                print("Face detection model loaded")
            else:
                print(f"Face detection model files not found in {self.model_dir}")
                self.net = None
        except Exception as e:
            print(f"Failed to load face detection model: {e}")
            self.net = None

    def blur_faces(self, image: np.ndarray, confidence_threshold: float = 0.5) -> np.ndarray:
        """Detect and blur faces in image"""
        if not config.face_blur_enabled or self.net is None:
            return image

        try:
            (h, w) = image.shape[:2]

            # Create blob for DNN
            blob = cv2.dnn.blobFromImage(
                cv2.resize(image, (300, 300)), 1.0,
                (300, 300), (104.0, 177.0, 123.0)
            )

            self.net.setInput(blob)
            detections = self.net.forward()

            # Process detections
            for i in range(0, detections.shape[2]):
                confidence = detections[0, 0, i, 2]

                if confidence > confidence_threshold:
                    # Get face coordinates
                    box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                    (startX, startY, endX, endY) = box.astype("int")

                    # Ensure coordinates are within image bounds
                    startX, startY = max(0, startX), max(0, startY)
                    endX, endY = min(w, endX), min(h, endY)

                    # Extract face region
                    face = image[startY:endY, startX:endX]

                    if face.size > 0:
                        # Apply Gaussian blur
                        blurred_face = cv2.GaussianBlur(face, (23, 23), 30)
                        image[startY:endY, startX:endX] = blurred_face

            return image

        except Exception as e:
            print(f"Face blurring failed: {e}")
            return image

    def process_image(self, image: np.ndarray) -> np.ndarray:
        """Process image for face blurring"""
        return self.blur_faces(image)


# Global face blurrer instance
face_blurrer = FaceBlurrer()