from __future__ import annotations

import os
from pathlib import Path

import httpx
import pytest
import respx


@pytest.mark.usefixtures("setup_env")
def test_enhance_with_input_url(test_app, sample_image_bytes) -> None:
    url = "https://example.com/sample.png"
    with respx.mock(assert_all_called=True) as mock:
        mock.get(url).mock(return_value=httpx.Response(200, content=sample_image_bytes))
        response = test_app.post("/enhance", json={"inputUrl": url})
    assert response.status_code == 200
    data = response.json()
    assert data["outputUrl"].startswith("/assets/ready/")
    relative = Path(data["outputUrl"]).as_posix().split("/assets/")[-1]
    asset_path = Path(os.environ["ASSETS_ROOT"]) / Path(relative)
    assert asset_path.exists()


@pytest.mark.usefixtures("setup_env")
def test_enhance_missing_payload(test_app) -> None:
    response = test_app.post("/enhance", json={})
    assert response.status_code == 400
    assert response.json()["detail"] == "inputUrl or file is required"


@pytest.mark.usefixtures("setup_env")
def test_enhance_invalid_preset(test_app) -> None:
    response = test_app.post("/enhance", json={"inputUrl": "https://example.com/a.png", "preset": "invalid"})
    assert response.status_code == 400
    assert response.json()["detail"] == "unsupported preset"
