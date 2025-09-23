# Background Processing Service

A comprehensive Python microservice for background cleanup and generative background replacement using FastAPI, rembg, and SDXL/Runway ML.

## Features

- **Background Cleanup**: Remove or soften image backgrounds while preserving foreground objects
- **Generative Background Replacement**: Replace backgrounds with AI-generated content using SDXL or Runway ML
- **Foreground Enhancement**: CLAHE-based enhancement and denoising for better product visibility
- **Color Matching**: Seamless color matching between foreground and generated backgrounds
- **Edge Blending**: Smooth edge feathering for natural-looking composites
- **REST API**: FastAPI-based service with automatic OpenAPI documentation

## Requirements

- Python 3.8+
- CUDA-compatible GPU (optional, for local SDXL generation)
- 8GB+ RAM (16GB+ recommended for SDXL)
- ~6GB disk space for model downloads

## Installation

1. **Clone and navigate to the service directory:**
```bash
cd services/background-service
```

2. **Create and activate a virtual environment:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```


4. **Set up environment variables (optional):**
```bash
# For Runway ML (if using cloud generation)
export RUNWAY_API_KEY="your_runway_api_key"

# For custom settings
export BG_ENGINE="SDXL"  # or "RUNWAY"
export DEVICE="cuda"     # or "cpu"
export OUTPUT_DIR="./output"

# --- Operational Hardening Knobs ---
# Max requests per minute (token bucket, default: 10)
export BG_REQS_PER_MIN=10
# Allow >4K resolution in SDXL mode (default: 0)
export ALLOW_4K=1
```
## Operational Guidance

- **Rate Limiting**: The service enforces a token bucket limiter (`BG_REQS_PER_MIN`, default 10). Exceeding this returns HTTP 429.
- **4K+ Rejection**: In SDXL mode, requests above 4096px in any dimension are rejected unless `ALLOW_4K=1` is set.
- **Background Caching**: SDXL-generated backgrounds are cached in-memory by (prompt, seed, size) to avoid redundant computation and cost.
- **Testing**: Unit tests cover limiter, 4K rejection, and caching logic for reliability.

## Usage

### Starting the Service

```bash
# Using the startup script
python run.py

# Or directly with uvicorn
uvicorn src.main:app --host 0.0.0.0 --port 8089 --reload
```

The service will be available at `http://localhost:8089` with automatic API documentation at `/docs`.

### API Endpoints

#### 1. Background Cleanup

**POST** `/background/cleanup`

Remove or soften image backgrounds while preserving the foreground object.

**Parameters:**
- `file`: Image file (multipart/form-data)
- `mode`: Cleanup mode (`"transparent"` or `"soften"`)
- `enhance_fg`: Enhance foreground contrast (boolean, default: `true`)
- `denoise`: Apply denoising (boolean, default: `false`)

**Example:**
```bash
curl -X POST "http://localhost:8089/background/cleanup" \
  -F "file=@product_image.jpg" \
  -F "mode=transparent" \
  -F "enhance_fg=true" \
  -F "denoise=false"
```

#### 2. Background Replacement

**POST** `/background/replace`

Replace image background with AI-generated content.

**Parameters:**
- `file`: Image file (multipart/form-data)
- `prompt`: Generation prompt for new background (string)
- `negative_prompt`: Negative prompt (string, default: `"people, text, watermark"`)
- `steps`: Inference steps (integer, 1-100, default: `20`)
- `guidance_scale`: Guidance scale (float, 1.0-20.0, default: `7.5`)
- `seed`: Random seed (integer, optional)
- `enhance_fg`: Enhance foreground (boolean, default: `true`)
- `match_colors`: Match colors between foreground and background (boolean, default: `true`)
- `feather_edges`: Feather edges for smooth blending (boolean, default: `true`)

**Example:**
```bash
curl -X POST "http://localhost:8089/background/replace" \
  -F "file=@product_image.jpg" \
  -F "prompt=modern minimalist studio with soft lighting" \
  -F "negative_prompt=people, text, watermark, cluttered" \
  -F "steps=25" \
  -F "guidance_scale=7.5" \
  -F "enhance_fg=true" \
  -F "match_colors=true" \
  -F "feather_edges=true"
```

#### 3. File Download

**GET** `/download/{filename}`

Download processed images.

#### 4. Service Health

**GET** `/health`

Check service health and configuration.

## Configuration

The service can be configured through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `BG_ENGINE` | Background generation engine (`SDXL` or `RUNWAY`) | `SDXL` |
| `DEVICE` | Compute device (`cuda` or `cpu`) | `cuda` if available |
| `HOST` | Service host | `0.0.0.0` |
| `PORT` | Service port | `8089` |
| `OUTPUT_DIR` | Output directory for processed images | `./output` |
| `MODEL_ID` | SDXL model ID | `stabilityai/stable-diffusion-xl-base-1.0` |
| `RUNWAY_API_KEY` | Runway ML API key | None |
| `DEBUG` | Enable debug mode | `False` |

## Architecture

The service is built with a modular architecture:

- **`src/main.py`**: FastAPI application with endpoints
- **`src/config.py`**: Configuration management with Pydantic
- **`src/models.py`**: Request/response data models
- **`src/io.py`**: Image I/O utilities with format handling
- **`src/masking.py`**: Foreground extraction using rembg
- **`src/enhance.py`**: Background cleanup and foreground enhancement
- **`src/generate.py`**: SDXL-based background generation
- **`src/runway_adapter.py`**: Runway ML API integration
- **`src/composite.py`**: Color matching and seamless compositing
- **`src/logger.py`**: Structured logging with loguru

## Processing Pipeline

### Background Cleanup
1. Load and validate input image
2. Extract foreground mask using rembg (u2net model)
3. Refine mask with morphological operations
4. Apply cleanup (transparent removal or softening)
5. Enhance foreground contrast (optional)
6. Apply denoising (optional)
7. Save result with alpha channel or original format

### Background Replacement
1. Load and validate input image
2. Extract and refine foreground mask
3. Generate new background using SDXL or Runway ML
4. Resize background to match input dimensions
5. Enhance foreground (optional)
6. Create seamless composite with color matching
7. Apply edge feathering and lighting consistency
8. Save final composite image

## Testing

Run the test suite:

```bash
# Install test dependencies
pip install pytest pytest-cov

# Run all tests
pytest

# Run with coverage
pytest --cov=src tests/

# Run specific test categories
pytest -m "not slow"  # Skip slow tests
pytest tests/test_service.py::TestAPI  # Run only API tests
```

## Performance Optimization

### For SDXL Generation:
- GPU with 8GB+ VRAM recommended
- Model CPU offloading enabled for lower VRAM usage
- VAE slicing and attention slicing for memory efficiency
- FP16 precision on GPU for faster inference

### For Production:
- Consider using Runway ML for cloud-based generation
- Implement result caching for repeated requests
- Use load balancing for multiple service instances
- Monitor GPU memory usage and implement cleanup

## Troubleshooting

### Common Issues:

1. **CUDA Out of Memory**
   - Reduce image resolution or batch size
   - Enable CPU offloading in config
   - Use `DEVICE=cpu` for CPU-only inference

2. **Model Download Fails**
   - Check internet connection
   - Verify disk space (6GB+ required)
   - Clear HuggingFace cache: `rm -rf ~/.cache/huggingface`

3. **Poor Mask Quality**
   - Try different rembg models in `masking.py`
   - Adjust morphological operations parameters
   - Preprocess input images (contrast, brightness)

4. **Runway API Errors**
   - Verify API key is valid
   - Check API rate limits and quotas
   - Monitor Runway service status

### Logs and Debugging:

Logs are written to:
- Console: INFO level and above
- `logs/app.log`: All logs with rotation
- `logs/error.log`: ERROR level only

Enable debug mode for verbose logging:
```bash
export DEBUG=true
```

## License

This service is part of the VitrineLu Marketing project. See the main project README for license information.

## Support

For issues and questions:
1. Check the logs for error details
2. Review this README and API documentation
3. Test with the provided examples
4. Create an issue in the main project repository