from __future__ import annotations

import base64

import httpx
import respx

from app.services.gemini import GeminiImageClient


def test_gemini_client_posts_expected_payload(sample_image_bytes) -> None:
    client = GeminiImageClient("test-key", "gemini-test", "preset-text")
    image_b64 = base64.b64encode(sample_image_bytes).decode("utf-8")
    response_body = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"inline_data": {"data": image_b64}},
                    ]
                }
            }
        ]
    }
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent"
    with respx.mock(assert_all_called=True) as mock:
        route = mock.post(url).mock(return_value=httpx.Response(200, json=response_body))
        result = client.enhance_image(sample_image_bytes, "custom-preset")
    assert route.called
    sent_json = route.calls[0].request.json()
    assert sent_json["contents"][0]["parts"][0]["text"] == "custom-preset"
    assert result == sample_image_bytes
