import os
import tempfile
import shutil
import pytest
from fastapi.testclient import TestClient
from services.background_service.src.main import app
from services.background_service.src.limits import OversizeError, RateLimitError

client = TestClient(app)

def setup_module(module):
    os.environ['BG_ENGINE'] = 'sdxl'
    os.environ['BG_REQS_PER_MIN'] = '2'
    os.environ['ALLOW_4K'] = '0'

def test_replace_200_and_cache(tmp_path, monkeypatch):
    fg = tmp_path / 'fg.jpg'
    bg = tmp_path / 'bg.jpg'
    fg.write_bytes(b'\xff' * 100)
    bg.write_bytes(b'\xff' * 100)
    monkeypatch.setattr('services.background_service.src.masking.create_mask', lambda x: b'1')
    monkeypatch.setattr('services.background_service.src.composite.lab_color_transfer', lambda fg, bg: b'2')
    monkeypatch.setattr('services.background_service.src.composite.alpha_composite', lambda fg, bg, mask: b'3')
    monkeypatch.setattr('services.background_service.src.composite.edge_feather', lambda mask: b'4')
    monkeypatch.setattr('services.background_service.src.generate.generate_sdxl', lambda *a, **kw: tmp_path / 'out.png')
    resp = client.post('/background/replace', json={
        'prompt': 'a', 'negative_prompt': '', 'seed': 1, 'size': [512,512],
        'fg_path': str(fg), 'bg_path': str(bg)
    })
    assert resp.status_code == 200
    data = resp.json()
    assert 'meta' in data and data['meta']['engine'] == 'sdxl'
    assert os.path.exists(data['outPng'])
    # Second call should hit cache
    resp2 = client.post('/background/replace', json={
        'prompt': 'a', 'negative_prompt': '', 'seed': 1, 'size': [512,512],
        'fg_path': str(fg), 'bg_path': str(bg)
    })
    assert resp2.status_code == 200
    assert resp2.json()['meta']['cache_hit']

def test_replace_413_oversize(tmp_path):
    fg = tmp_path / 'fg.jpg'
    bg = tmp_path / 'bg.jpg'
    fg.write_bytes(b'\xff' * 100)
    bg.write_bytes(b'\xff' * 100)
    resp = client.post('/background/replace', json={
        'prompt': 'a', 'negative_prompt': '', 'seed': 1, 'size': [8192,8192],
        'fg_path': str(fg), 'bg_path': str(bg)
    })
    assert resp.status_code == 413

def test_replace_429_rate_limit(tmp_path, monkeypatch):
    fg = tmp_path / 'fg.jpg'
    bg = tmp_path / 'bg.jpg'
    fg.write_bytes(b'\xff' * 100)
    bg.write_bytes(b'\xff' * 100)
    # Set limiter to 1 req/min
    os.environ['BG_REQS_PER_MIN'] = '1'
    from services.background_service.src.main import limiter
    limiter.tokens = 0
    resp = client.post('/background/replace', json={
        'prompt': 'a', 'negative_prompt': '', 'seed': 1, 'size': [512,512],
        'fg_path': str(fg), 'bg_path': str(bg)
    })
    assert resp.status_code == 429
