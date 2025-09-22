# Media Ingest Service

Automated media processing pipeline for VitrineAlu Marketing. Ingests images from Google Drive and NAS, applies curation, enhancement, watermarking, and face blurring.

## Features

- **Multi-source ingestion**: Google Drive sync and NAS directory watching
- **Intelligent curation**: Aesthetic scoring, technical quality assessment, duplicate detection
- **Image enhancement**: Multiple backends (RealESRGAN, GFPGAN, PIL)
- **Privacy protection**: Automatic face blurring
- **Brand consistency**: Watermark overlay with brand kit support
- **Organized output**: Date-based folder structure with metadata sidecars

## Installation

### Prerequisites

- Conda (Miniconda or Anaconda)
- Python 3.8+
- Google Cloud service account with Drive API enabled
- NAS storage (optional)

### Setup

1. Clone the repository and navigate to the service:
   ```bash
   cd services/media_ingest
   ```

2. Create and activate the conda environment:
   ```bash
   conda env create -f environment.yml
   conda activate media-ingest
   ```

3. Set up environment variables (see `.env.example`):
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. Configure brand kit:
   ```bash
   cp config/brand.example.yaml config/brand.yaml
   # Edit brand.yaml with your brand settings
   ```

## Configuration

### Environment Variables

Create a `.env` file with:

```bash
# Google Drive
MEDIA_INGEST_GOOGLE_CREDS_PATH=/path/to/service-account.json

# NAS paths (comma-separated)
MEDIA_INGEST_NAS_PATHS=/mnt/nas/photos,/mnt/nas/uploads

# Output
MEDIA_INGEST_OUTPUT_BASE_PATH=/media/curated
MEDIA_INGEST_TEMP_DIR=/tmp/media_ingest

# Processing settings
MEDIA_INGEST_CONCURRENCY=4
MEDIA_INGEST_MAX_FILE_SIZE_MB=100

# Curation thresholds
MEDIA_INGEST_AESTHETIC_THRESHOLD=0.5
MEDIA_INGEST_SHARPNESS_THRESHOLD=100.0
MEDIA_INGEST_DUPLICATE_HAMMING_THRESHOLD=5

# Brand
MEDIA_INGEST_BRAND_KIT_PATH=config/brand.yaml
MEDIA_INGEST_WATERMARK_PATH=/path/to/watermark.png

# Feature toggles
MEDIA_INGEST_FACE_BLUR_ENABLED=true
MEDIA_INGEST_ENHANCEMENT_ENABLED=true

# Enhancement
MEDIA_INGEST_ENHANCEMENT_BACKEND=realesrgan
MEDIA_INGEST_ENHANCEMENT_SCALE=2

# Logging
MEDIA_INGEST_LOG_LEVEL=INFO
MEDIA_INGEST_LOG_FILE=logs/media_ingest.log

# Database
MEDIA_INGEST_PROCESSED_DB_PATH=state/processed.sqlite
```

### Google Drive Setup

1. Create a Google Cloud service account
2. Enable Google Drive API
3. Download the JSON key file
4. Set the path in `MEDIA_INGEST_GOOGLE_CREDS_PATH`
5. Share the Drive folders with the service account email

### Brand Kit Configuration

The `config/brand.yaml` file should contain:

```yaml
brand: vitrinealu
colors:
  primary: "#0066CC"
  secondary: "#FF6600"
fonts:
  primary: "Arial"
  secondary: "Helvetica"
watermark:
  path: "/path/to/logo.png"
  opacity: 0.8
  scale: 0.15
aspect_ratios:
  - "16:9"
  - "4:3"
  - "1:1"
```

## Usage

**Note:** Make sure to activate the conda environment before running any commands:

```bash
conda activate media-ingest
```

### CLI Commands

#### Sync from Google Drive
```bash
python -m media_ingest.cli sync-gdrive --folder-id YOUR_FOLDER_ID
```

#### Watch NAS directories
```bash
python -m media_ingest.cli watch-nas
```

#### Process single file/directory
```bash
python -m media_ingest.cli run-once /path/to/image.jpg
python -m media_ingest.cli run-once /path/to/directory --source manual
```

#### Reprocess files
```bash
python -m media_ingest.cli reprocess "*.jpg" --source reprocess
```

#### View statistics
```bash
python -m media_ingest.cli stats
```

### Output Structure

Processed images are organized as:
```
/media/curated/
├── 2024/
│   ├── 01/
│   │   ├── sample-image/
│   │   │   ├── sample-image.jpg
│   │   │   └── sample-image.json
```

### Metadata Format

Each processed image has a sidecar JSON file:

```json
{
  "source": "gdrive|nas",
  "original_path": "/path/to/original.jpg",
  "output_path": "/media/curated/2024/01/sample/sample.jpg",
  "processed_at": "2024-01-15T10:30:00Z",
  "scores": {
    "aesthetic": 0.85,
    "sharpness": 245.67,
    "exposure": 0.72,
    "blur": 245.67
  },
  "decisions": {
    "kept": true,
    "reasons": []
  },
  "enhancement": {
    "backend": "realesrgan",
    "scale": 2
  },
  "faces_blurred": true,
  "watermark": "/path/to/logo.png",
  "brand": "vitrinealu"
}
```

## Development

### Environment Setup

Before running any commands, activate the conda environment:

```bash
conda activate media-ingest
```

### Running Tests

```bash
pytest tests/
```

### Adding New Enhancement Backends

1. Add the backend to `enhance.py`
2. Update the config validation
3. Add tests in `test_enhance.py`

### Extending Curation

Add new scoring functions in `curation.py` and update the `should_keep_image` logic.

## Troubleshooting

### Common Issues

1. **Google Drive authentication fails**
   - Verify service account JSON is correct
   - Check folder sharing permissions
   - Ensure Drive API is enabled

2. **NAS watching not working**
   - Check NAS paths exist and are accessible
   - Verify watchdog installation
   - Check file system permissions

3. **Enhancement models not loading**
   - Download model weights to `models/` directory
   - Check GPU memory if using CUDA
   - Fall back to PIL backend

4. **Face detection not working**
   - Download OpenCV DNN models to `models/` directory
   - Verify model file paths

### Logs

Check `logs/media_ingest.log` for detailed error information.

### Performance Tuning

- Adjust `MEDIA_INGEST_CONCURRENCY` based on system resources
- Use SSD storage for temp and output directories
- Consider GPU acceleration for ML models
- Monitor disk I/O for large batch processing

## License

Internal use only - VitrineAlu Marketing