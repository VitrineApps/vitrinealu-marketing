from __future__ import annotations

import base64
from typing import Any, Dict

import httpx


class GeminiError(RuntimeError):
    pass


class GeminiImageClient:
    def __init__(self, api_key: str, model: str, prompt_preset: str) -> None:
        self.api_key = api_key
        self.model = model
        self.prompt_preset = prompt_preset
        self._base_url = "https://generativelanguage.googleapis.com/v1beta"
        self._client = httpx.Client(timeout=60.0)

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def enhance_image(self, image_bytes: bytes, preset: str | None = None) -> bytes:
        payload = self._build_payload(image_bytes, preset or self.prompt_preset)
        response = self._post_generate(payload)
        return self._extract_image(response)

    def replace_background(self, image_bytes: bytes, prompt: str | None = None) -> bytes:
        payload = self._build_payload(image_bytes, prompt or self.prompt_preset)
        response = self._post_generate(payload)
        return self._extract_image(response)

    def _build_payload(self, image_bytes: bytes, prompt_text: str) -> Dict[str, Any]:
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        return {
            "contents": [
                {
                    "parts": [
                        {"text": prompt_text},
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": encoded,
                            }
                        },
                    ]
                }
            ]
        }

    def _post_generate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self.api_key:
            raise GeminiError("Gemini API key is not configured")
        url = f"{self._base_url}/models/{self.model}:generateContent"
        response = self._client.post(url, params={"key": self.api_key}, json=payload)
        response.raise_for_status()
        data = response.json()
        return data

    def _extract_image(self, response_json: Dict[str, Any]) -> bytes:
        try:
            parts = response_json["candidates"][0]["content"]["parts"]
            inline = next(part for part in parts if "inline_data" in part)
            data_b64 = inline["inline_data"]["data"]
        except (KeyError, IndexError, StopIteration) as exc:
            raise GeminiError("Gemini response missing inline image data") from exc
        return base64.b64decode(data_b64)


__all__ = ["GeminiImageClient", "GeminiError"]
