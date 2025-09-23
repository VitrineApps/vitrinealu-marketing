# Background Replacement Service

A Python module for replacing image backgrounds using AI models.

## Features

- Supports local Stable Diffusion inpainting and RunwayML API
- Automatic mask generation from foreground
- Preset-based prompts for lifestyle backgrounds
- Deterministic mode for reproducible results

## Environment Variables

- `BG_REPLACE_ENGINE`: Engine to use ("diffusion" or "runway")
- `RUNWAY_API_KEY`: API key for RunwayML (required for runway engine)
- `SAFETY_CHECKER`: Enable safety checker for diffusion ("true" or "false", default "false")
- `BG_REPLACE_DETERMINISTIC`: Force deterministic seeding ("true" or "false", default "false")

## Usage

```python
from services.background.replace_background import replace_background

result = replace_background(
    in_path="input.jpg",
    out_path="output.jpg",
    preset="modern_garden_day",
    prompt_overrides={"guidance_scale": 9.0},
    mask_path=None,  # Auto-generate mask
    seed=42
)
print(result)
```

## CLI Usage

Assuming a CLI script is added:

```bash
export BG_REPLACE_ENGINE=diffusion
python -c "from services.background.replace_background import replace_background; replace_background('input.jpg', 'output.jpg', 'sunset_patio')"
```

## Presets

See `presets.yaml` for available presets. You can override any field via `prompt_overrides`.
