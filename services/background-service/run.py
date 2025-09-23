#!/usr/bin/env python3
"""Startup script for the background processing service."""

import sys
import os
from pathlib import Path

# Add src directory to Python path
src_dir = Path(__file__).parent / "src"
sys.path.insert(0, str(src_dir))

# Import and run the main application
from src.main import main

if __name__ == "__main__":
    main()