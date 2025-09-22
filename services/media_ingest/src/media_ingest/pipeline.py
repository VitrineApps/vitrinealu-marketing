"""Main media processing pipeline"""

import hashlib
import json
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
from PIL import Image

from .config import config
from .curation import curation_engine
from .enhance import enhancer
from .face_blur import face_blurrer
from .watermark import watermark_applier


class ProcessedDatabase:
    """Database for tracking processed files"""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialize database schema"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS processed (
                    sha256 TEXT PRIMARY KEY,
                    source_path TEXT,
                    output_path TEXT,
                    processed_at TIMESTAMP,
                    source TEXT
                )
            ''')

    def is_processed(self, sha256: str) -> bool:
        """Check if file has been processed"""
        with sqlite3.connect(self.db_path) as conn:
            return conn.execute(
                'SELECT 1 FROM processed WHERE sha256 = ?', (sha256,)
            ).fetchone() is not None

    def mark_processed(self, sha256: str, source_path: str, output_path: str, source: str):
        """Mark file as processed"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute('''
                INSERT OR REPLACE INTO processed
                VALUES (?, ?, ?, datetime('now'), ?)
            ''', (sha256, source_path, output_path, source))


class MediaPipeline:
    """Complete media processing pipeline"""

    def __init__(self):
        self.db = ProcessedDatabase(config.processed_db_path)
        Path(config.output_base_path).mkdir(parents=True, exist_ok=True)
        Path(config.temp_dir).mkdir(parents=True, exist_ok=True)

    def compute_sha256(self, file_path: Path) -> str:
        """Compute SHA256 hash of file"""
        hash_sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()

    def generate_output_path(self, original_path: Path, scores: Dict) -> Path:
        """Generate organized output path based on date and content"""
        # Use current date for organization
        now = datetime.now()
        year = now.strftime("%Y")
        month = now.strftime("%m")

        # Create slug from filename (simplified)
        stem = original_path.stem
        slug = "".join(c for c in stem if c.isalnum() or c in " -_").rstrip()
        if not slug:
            slug = "image"

        # Create path
        output_dir = Path(config.output_base_path) / year / month / slug
        output_dir.mkdir(parents=True, exist_ok=True)

        # Find unique filename
        ext = original_path.suffix
        base_path = output_dir / f"{stem}{ext}"
        counter = 1
        while base_path.exists():
            base_path = output_dir / f"{stem}_{counter}{ext}"
            counter += 1

        return base_path

    def create_sidecar_json(self, output_path: Path, metadata: Dict):
        """Create sidecar JSON file with processing metadata"""
        json_path = output_path.with_suffix('.json')
        with open(json_path, 'w') as f:
            json.dump(metadata, f, indent=2, default=str)

    def process_file(self, input_path: Path, source: str = "nas") -> Optional[Path]:
        """Process a single media file through the complete pipeline"""
        try:
            print(f"Processing {input_path} from {source}")

            # 1. Compute hash for idempotency
            file_hash = self.compute_sha256(input_path)
            if self.db.is_processed(file_hash):
                print(f"Skipping already processed file: {input_path}")
                return None

            # 2. Load image
            pil_image = Image.open(input_path)
            cv_image = cv2.imread(str(input_path))

            # 3. Duplicate detection
            perceptual_hash = curation_engine.compute_perceptual_hash(input_path)
            if curation_engine.check_duplicate(perceptual_hash):
                print(f"Skipping duplicate: {input_path}")
                return None

            # 4. Curation scoring
            scores = curation_engine.score_image(input_path)
            keep, reasons = curation_engine.should_keep_image(scores)

            if not keep:
                print(f"Rejecting image {input_path}: {reasons}")
                return None

            # 5. Enhancement
            enhanced_pil = enhancer.process_image(pil_image)

            # 6. Watermark
            watermarked_pil = watermark_applier.apply_watermark(enhanced_pil)

            # 7. Face blur (convert back to CV2 for processing)
            if config.face_blur_enabled:
                # Convert PIL back to CV2
                watermarked_cv = cv2.cvtColor(np.array(watermarked_pil), cv2.COLOR_RGB2BGR)
                blurred_cv = face_blurrer.process_image(watermarked_cv)
                final_pil = Image.fromarray(cv2.cvtColor(blurred_cv, cv2.COLOR_BGR2RGB))
            else:
                final_pil = watermarked_pil

            # 8. Generate output path and save
            output_path = self.generate_output_path(input_path, scores)
            final_pil.save(output_path, quality=95)

            # 9. Create sidecar metadata
            metadata = {
                "source": source,
                "original_path": str(input_path),
                "output_path": str(output_path),
                "processed_at": datetime.now().isoformat(),
                "scores": scores,
                "decisions": {
                    "kept": True,
                    "reasons": []
                },
                "enhancement": {
                    "backend": config.enhancement_backend,
                    "scale": config.enhancement_scale
                },
                "faces_blurred": config.face_blur_enabled,
                "watermark": config.watermark_path,
                "brand": "vitrinealu"
            }
            self.create_sidecar_json(output_path, metadata)

            # 10. Mark as processed
            self.db.mark_processed(file_hash, str(input_path), str(output_path), source)

            print(f"Successfully processed {input_path} -> {output_path}")
            return output_path

        except Exception as e:
            print(f"Error processing {input_path}: {e}")
            return None

    def process_batch(self, file_paths: List[Path], source: str = "nas", max_workers: Optional[int] = None):
        """Process multiple files in parallel"""
        from concurrent.futures import ThreadPoolExecutor

        max_workers = max_workers or config.concurrency

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(self.process_file, path, source)
                for path in file_paths
            ]

            results = []
            for future in futures:
                try:
                    result = future.result()
                    if result:
                        results.append(result)
                except Exception as e:
                    print(f"Batch processing error: {e}")

            return results


# Global pipeline instance
pipeline = MediaPipeline()