from __future__ import annotations

import json
from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .config import Settings, get_settings
from .io import (
    create_output_url,
    ensure_asset_dir,
    generate_asset_id,
    load_image_from_bytes,
    save_image,
)
from .pipelines.background_replace import BackgroundReplacePipeline
from .pipelines.enhance import EnhancePipeline
from .schemas import (
    BackgroundReplaceRequest,
    EnhanceRequest,
    EnhanceResponse,
    ErrorResponse,
)


async def fetch_image_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("GET", url) as response:
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise HTTPException(status_code=response.status_code, detail=str(exc)) from exc
            chunks = []
            async for chunk in response.aiter_bytes():
                chunks.append(chunk)
    if not chunks:
        raise HTTPException(status_code=400, detail="Remote image download returned no data")
    return b"".join(chunks)


def _allowed_presets(settings: Settings) -> set[str]:
    presets = {settings.default_preset}
    gemini_cfg = settings.providers.get("image_enhance", {}).get("gemini", {})
    preset = gemini_cfg.get("prompt_preset")
    if preset:
        presets.add(preset)
    return presets


def _prepare_metadata(raw: Optional[str | Dict[str, Any]]) -> Dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="metadata must be valid JSON") from exc
    raise HTTPException(status_code=400, detail="metadata must be a JSON object")


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    if settings is None:
        get_settings.cache_clear()
        settings = get_settings()
    enhance_pipeline = EnhancePipeline(settings)
    background_pipeline = BackgroundReplacePipeline(settings)

    app = FastAPI(title="Enhance Service", version="1.0.0")

    def get_settings_dep() -> Settings:
        return settings

    def get_enhance_pipeline() -> EnhancePipeline:
        return enhance_pipeline

    def get_background_pipeline() -> BackgroundReplacePipeline:
        return background_pipeline

    @app.get("/health", response_model=Dict[str, str])
    async def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.post(
        "/enhance",
        response_model=EnhanceResponse,
        responses={400: {"model": ErrorResponse}},
    )
    async def enhance(
        request: Request,
        file: UploadFile | None = File(default=None),
        settings: Settings = Depends(get_settings_dep),
        pipeline: EnhancePipeline = Depends(get_enhance_pipeline),
    ) -> EnhanceResponse:
        payload = await _extract_payload(request, file)
        if not payload.inputUrl and file is None:
            raise HTTPException(status_code=400, detail="inputUrl or file is required")
        preset = payload.preset or settings.default_preset
        if preset not in _allowed_presets(settings):
            raise HTTPException(status_code=400, detail="unsupported preset")

        image_bytes = await _load_image_bytes(file, payload.inputUrl)
        image = load_image_from_bytes(image_bytes)
        output_image, meta = await run_in_threadpool(
            pipeline.execute,
            image,
            preset,
            dict(payload.metadata),
        )
        asset_id = generate_asset_id()
        directory, date_segment = ensure_asset_dir(settings, asset_id)
        output_path = directory / "enhanced.png"
        await run_in_threadpool(save_image, output_image, output_path)
        output_url = create_output_url(date_segment, asset_id, output_path.name)
        meta.update({"assetId": asset_id})
        return EnhanceResponse(assetId=asset_id, outputUrl=output_url, metadata=meta)

    @app.post(
        "/background/replace",
        response_model=EnhanceResponse,
        responses={400: {"model": ErrorResponse}},
    )
    async def background_replace(
        request: Request,
        file: UploadFile | None = File(default=None),
        settings: Settings = Depends(get_settings_dep),
        pipeline: BackgroundReplacePipeline = Depends(get_background_pipeline),
    ) -> EnhanceResponse:
        payload = await _extract_background_payload(request, file)
        if not payload.inputUrl and file is None:
            raise HTTPException(status_code=400, detail="inputUrl or file is required")
        image_bytes = await _load_image_bytes(file, payload.inputUrl)
        image = load_image_from_bytes(image_bytes)
        output_image, meta = await run_in_threadpool(
            pipeline.execute,
            image,
            payload.prompt,
            dict(payload.metadata),
        )
        asset_id = generate_asset_id()
        directory, date_segment = ensure_asset_dir(settings, asset_id)
        output_path = directory / "background.png"
        await run_in_threadpool(save_image, output_image, output_path)
        output_url = create_output_url(date_segment, asset_id, output_path.name)
        meta.update({"assetId": asset_id})
        return EnhanceResponse(assetId=asset_id, outputUrl=output_url, metadata=meta)

    return app


async def _load_image_bytes(file: UploadFile | None, input_url: Optional[str]) -> bytes:
    if file is not None:
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="uploaded file is empty")
        return data
    if input_url:
        return await fetch_image_bytes(input_url)
    raise HTTPException(status_code=400, detail="inputUrl or file is required")


async def _extract_payload(request: Request, file: UploadFile | None) -> EnhanceRequest:
    if file is not None:
        form = await request.form()
        input_url = form.get("inputUrl")
        preset = form.get("preset")
        metadata = _prepare_metadata(form.get("metadata"))
        return EnhanceRequest.model_validate({"inputUrl": input_url, "preset": preset, "metadata": metadata})
    if request.headers.get("content-type", "").startswith("application/json"):
        data = await request.json()
        return EnhanceRequest.model_validate(data)
    form = await request.form()
    input_url = form.get("inputUrl")
    preset = form.get("preset")
    metadata = _prepare_metadata(form.get("metadata"))
    return EnhanceRequest.model_validate({"inputUrl": input_url, "preset": preset, "metadata": metadata})


async def _extract_background_payload(request: Request, file: UploadFile | None) -> BackgroundReplaceRequest:
    if file is not None:
        form = await request.form()
        input_url = form.get("inputUrl")
        prompt = form.get("prompt")
        metadata = _prepare_metadata(form.get("metadata"))
        return BackgroundReplaceRequest.model_validate({"inputUrl": input_url, "prompt": prompt, "metadata": metadata})
    if request.headers.get("content-type", "").startswith("application/json"):
        data = await request.json()
        return BackgroundReplaceRequest.model_validate(data)
    form = await request.form()
    input_url = form.get("inputUrl")
    prompt = form.get("prompt")
    metadata = _prepare_metadata(form.get("metadata"))
    return BackgroundReplaceRequest.model_validate({"inputUrl": input_url, "prompt": prompt, "metadata": metadata})


app = create_app()
