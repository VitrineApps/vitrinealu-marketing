#!/usr/bin/env python3
import argparse
import json
import sys
import os
from services.background.replace_background import replace_background

def main():
    parser = argparse.ArgumentParser(description="Background replacement CLI")
    parser.add_argument("--in", dest="in_path", required=True, help="Input image path")
    parser.add_argument("--out", dest="out_path", required=True, help="Output image path")
    parser.add_argument("--preset", required=True, help="Preset name")
    parser.add_argument("--mask", dest="mask_path", help="Mask image path")
    parser.add_argument("--engine", choices=["diffusion", "runway"], help="Engine to use")
    parser.add_argument("--seed", type=int, help="Random seed")
    parser.add_argument("--overrides", type=json.loads, help="JSON string of prompt overrides")

    args = parser.parse_args()

    # Set engine if provided
    if args.engine:
        os.environ["BG_REPLACE_ENGINE"] = args.engine

    try:
        result = replace_background(
            in_path=args.in_path,
            out_path=args.out_path,
            preset=args.preset,
            prompt_overrides=args.overrides,
            mask_path=args.mask_path,
            seed=args.seed
        )
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()