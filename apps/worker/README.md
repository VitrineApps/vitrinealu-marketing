# Worker Service

Fastify-based worker handling pipeline jobs and approvals. Start with `pnpm --filter @vitrinealu/worker dev`.

## Environment Variables

- `TOPAZ_CLI`: Path to Topaz CLI executable (optional). Example: `/usr/local/bin/topaz` or `"C:\Program Files\Topaz Labs LLC\Topaz Video AI\Topaz Video AI.exe"` (Windows with quotes)
- `REAL_ESRGAN_BIN`: Path to RealESRGAN binary (optional). Example: `/opt/realesrgan/realesrgan-ncnn-vulkan` or `"C:\path\to\realesrgan-ncnn-vulkan.exe"` (Windows with quotes)
- `ENHANCE_DEFAULT_SCALE`: Default upscale factor for enhancement (default: 2). Example: `4`
- `ENHANCE_KEEP_SCALE`: If set to 1, shrink enhanced images back to ~2x scale if upscaled more (default: 1). Example: `0` to disable
- `PYTHON_BIN`: Path to Python executable for OpenCV post-processing (default: `python3`). Example: `python` or `"C:\Python39\python.exe"` (Windows with quotes)
