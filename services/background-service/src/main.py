"""Main FastAPI application for background processing service."""

import os
import time
from threading import Lock
import traceback
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from .logger import log
from .config import settings, BGEngine, BGMode

# --- Token bucket limiter ---
BG_REQS_PER_MIN = int(os.getenv('BG_REQS_PER_MIN', '10'))
_bucket_tokens = BG_REQS_PER_MIN
_bucket_last = time.time()
_bucket_lock = Lock()
def _consume_token() -> bool:
    global _bucket_tokens, _bucket_last
    with _bucket_lock:
        now = time.time()
        elapsed = now - _bucket_last
        refill = int(elapsed * (BG_REQS_PER_MIN / 60))
        if refill > 0:
            _bucket_tokens = min(BG_REQS_PER_MIN, _bucket_tokens + refill)
            _bucket_last = now
        if _bucket_tokens > 0:
            _bucket_tokens -= 1
            return True
        return False
from .models import CleanupRequest, ReplaceRequest, ProcessingResponse
from .io import load_image, save_image, generate_output_path
from .masking import extract_foreground_mask, refine_mask
from .enhance import cleanup_background_transparent, cleanup_background_soften, enhance_foreground
from .composite import create_seamless_composite, adjust_lighting_consistency
from .generate import generate_background_sdxl, resize_background_to_match
from .runway_adapter import generate_background_runway


# Initialize FastAPI app
app = FastAPI(
    title="Background Processing Service",
    description="Microservice for background cleanup and generative background replacement",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize service on startup."""
    log.info("Starting Background Processing Service")
    log.info(f"Output directory: {settings.output_dir}")
    log.info(f"Background engine: {settings.bg_engine}")
    log.info(f"Device: {settings.device}")
    
    # Ensure output directory exists
    settings.output_dir.mkdir(parents=True, exist_ok=True)


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    log.info("Shutting down Background Processing Service")
    
    # Cleanup generators if using SDXL
    if settings.bg_engine == BGEngine.SDXL:
        try:
            from .generate import get_sdxl_generator
            generator = get_sdxl_generator()
            generator.cleanup()
        except Exception as e:
            log.warning(f"Error during SDXL cleanup: {e}")


@app.get("/")
async def root():
    """Root endpoint with service info."""
    return {
        "service": "Background Processing Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": [
            "/background/cleanup",
            "/background/replace"
        ]
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "engine": settings.bg_engine.value,
        "device": settings.device
    }


@app.post("/background/cleanup", response_model=ProcessingResponse)
async def cleanup_background(
    file: UploadFile = File(...),
    mode: str = Form(default="transparent"),
    enhance_fg: bool = Form(default=True),
    denoise: bool = Form(default=False)
):
    """
    Clean up image background by removing or softening it.
    
    Args:
        file: Input image file
        mode: Cleanup mode ('transparent' or 'soften')
        enhance_fg: Whether to enhance foreground
        denoise: Whether to apply denoising
        
    Returns:
        Processing response with output file path
    """
    # Token bucket limiter
    if not _consume_token():
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")
    try:
        log.info(f"Processing cleanup request: mode={mode}, enhance_fg={enhance_fg}, denoise={denoise}")
        
        # Validate mode
        try:
            bg_mode = BGMode(mode)
        except ValueError:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid mode '{mode}'. Must be 'transparent' or 'soften'"
            )
        
        # Load input image
        image_data = await file.read()
        input_image = load_image(image_data)
        
        log.info(f"Loaded input image: {input_image.shape}")
        
        # Extract foreground mask
        mask = extract_foreground_mask(input_image)
        mask = refine_mask(mask, input_image)
        
        # Clean up background based on mode
        if bg_mode == BGMode.TRANSPARENT:
            processed_image = cleanup_background_transparent(input_image, mask)
        else:  # soften
            processed_image = cleanup_background_soften(input_image, mask)
        
        # Enhance foreground if requested
        if enhance_fg:
            processed_image = enhance_foreground(processed_image, mask)
        
        # Apply denoising if requested
        if denoise:
            from .enhance import denoise_image
            processed_image = denoise_image(processed_image)
        
        # Save output
        output_path = generate_output_path(settings.output_dir, file.filename, "cleaned")
        save_image(processed_image, output_path)
        
        log.info(f"Cleanup complete: {output_path}")
        
        return ProcessingResponse(
            success=True,
            output_path=str(output_path),
            message="Background cleanup completed successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Cleanup failed: {e}")
        log.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/background/replace", response_model=ProcessingResponse)
async def replace_background(
    file: UploadFile = File(...),
    prompt: str = Form(...),
    negative_prompt: str = Form(default="people, text, watermark"),
    steps: int = Form(default=20),
    guidance_scale: float = Form(default=7.5),
    seed: Optional[int] = Form(default=None),
    enhance_fg: bool = Form(default=True),
    match_colors: bool = Form(default=True),
    feather_edges: bool = Form(default=True)
):
    """
    Replace image background with AI-generated content.
    
    Args:
        file: Input image file
        prompt: Generation prompt for new background
        negative_prompt: Negative prompt
        steps: Number of inference steps
        guidance_scale: Guidance scale for generation
        seed: Random seed (optional)
        enhance_fg: Whether to enhance foreground
        match_colors: Whether to match colors between foreground and background
        feather_edges: Whether to feather edges for smooth blending
        
    Returns:
        Processing response with output file path
    """
    # Token bucket limiter
    if not _consume_token():
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")
    try:
        log.info(f"Processing replace request: prompt='{prompt}', steps={steps}, guidance={guidance_scale}")
        
        # Validate parameters
        if steps < 1 or steps > 100:
            raise HTTPException(status_code=400, detail="Steps must be between 1 and 100")
        if guidance_scale < 1.0 or guidance_scale > 20.0:
            raise HTTPException(status_code=400, detail="Guidance scale must be between 1.0 and 20.0")
        
        # Load input image
        image_data = await file.read()
        input_image = load_image(image_data)
        
        log.info(f"Loaded input image: {input_image.shape}")
        
        # Extract foreground mask
        mask = extract_foreground_mask(input_image)
        mask = refine_mask(mask, input_image)
        

        # Generate new background
        target_height, target_width = input_image.shape[:2]
        max_dim = max(target_width, target_height)
        engine = settings.bg_engine
        allow_4k = os.getenv('ALLOW_4K', '0') == '1'
        runway_timeout_ms = int(os.getenv('RUNWAY_TIMEOUT_MS', '180000'))
        fallback_local = os.getenv('BG_FALLBACK_LOCAL', '0') == '1'
        generated_bg = None
        error = None
        if engine == BGEngine.RUNWAY:
            try:
                if max_dim > 4096 and not allow_4k:
                    raise HTTPException(status_code=400, detail="4K+ resolution not allowed in Runway mode unless ALLOW_4K=1")
                from .runway_adapter import generate_background_remote
                tmp_path = generate_background_remote(prompt, negative_prompt, seed, (1024, 1024), timeout_ms=runway_timeout_ms)
                generated_bg = load_image(open(tmp_path, 'rb').read())
                os.unlink(tmp_path)
            except Exception as e:
                error = e
                log.warning(f"Runway generation failed: {e}")
                if fallback_local:
                    log.info("Falling back to local SDXL generation...")
                    engine = BGEngine.SDXL
                else:
                    raise HTTPException(status_code=500, detail=f"Runway generation failed: {e}")
        if engine == BGEngine.SDXL:
            if max_dim > 4096 and not allow_4k:
                raise HTTPException(status_code=400, detail="4K+ resolution not allowed in SDXL mode unless ALLOW_4K=1")
            generated_bg = generate_background_sdxl(
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=1024,
                height=1024,
                steps=steps,
                guidance_scale=guidance_scale,
                seed=seed
            )
        if generated_bg is None:
            raise HTTPException(status_code=500, detail="Background generation failed (no image)")

        # Resize background to match input image
        background = resize_background_to_match(generated_bg, (target_height, target_width))
        
        # Enhance foreground if requested
        enhanced_image = input_image
        if enhance_fg:
            enhanced_image = enhance_foreground(input_image, mask)
        
        # Create seamless composite
        composite = create_seamless_composite(
            foreground=enhanced_image,
            background=background,
            mask=mask,
            match_colors=match_colors,
            feather_edges=feather_edges
        )
        
        # Adjust lighting consistency
        final_image = adjust_lighting_consistency(composite, mask)
        
        # Save output
        output_path = generate_output_path(settings.output_dir, file.filename, "replaced")
        save_image(final_image, output_path)
        
        log.info(f"Background replacement complete: {output_path}")
        
        return ProcessingResponse(
            success=True,
            output_path=str(output_path),
            message="Background replacement completed successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Background replacement failed: {e}")
        log.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.get("/download/{filename}")
async def download_file(filename: str):
    """
    Download processed file.
    
    Args:
        filename: Name of file to download
        
    Returns:
        File response with processed image
    """
    try:
        file_path = settings.output_dir / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type="image/jpeg"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Download failed: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    log.error(f"Unhandled exception: {exc}")
    log.error(traceback.format_exc())
    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "detail": str(exc)
        }
    )


def main():
    """Run the FastAPI application."""
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info"
    )


if __name__ == "__main__":
    main()