from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, HttpUrl


class EnhanceRequest(BaseModel):
    inputUrl: Optional[HttpUrl] = None
    preset: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BackgroundReplaceRequest(BaseModel):
    inputUrl: Optional[HttpUrl] = None
    prompt: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EnhanceResponse(BaseModel):
    assetId: str
    outputUrl: str
    metadata: Dict[str, Any]


class ErrorResponse(BaseModel):
    detail: str
