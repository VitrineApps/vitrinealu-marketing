#!/usr/bin/env python3
import argparse
import cv2
import numpy as np
import shutil
import sys

def main():
    parser = argparse.ArgumentParser(description='OpenCV post-processing for enhanced images')
    parser.add_argument('--input', required=True, help='Input image path')
    parser.add_argument('--output', required=True, help='Output image path')
    args = parser.parse_args()

    try:
        # Read image
        img = cv2.imread(args.input)
        if img is None:
            raise ValueError(f"Could not read image from {args.input}")

        # Convert to LAB
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)

        # CLAHE on L channel
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)

        # Merge back
        lab_clahe = cv2.merge([l_clahe, a, b])

        # Convert back to BGR
        balanced = cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2BGR)

        # Simple gray-world white balance
        # Calculate mean of each channel
        means = cv2.mean(balanced)[:3]  # BGR
        avg_mean = np.mean(means)

        # Scale each channel to match average
        scales = [avg_mean / mean if mean > 0 else 1.0 for mean in means]

        # Apply scaling
        balanced = balanced.astype(np.float32)
        balanced[:, :, 0] *= scales[0]  # B
        balanced[:, :, 1] *= scales[1]  # G
        balanced[:, :, 2] *= scales[2]  # R
        balanced = np.clip(balanced, 0, 255).astype(np.uint8)

        # Write with quality 92
        cv2.imwrite(args.output, balanced, [cv2.IMWRITE_JPEG_QUALITY, 92])

    except Exception as e:
        print(f"Error processing image: {e}", file=sys.stderr)
        # On error, copy input to output
        shutil.copy2(args.input, args.output)
        sys.exit(1)

if __name__ == '__main__':
    main()