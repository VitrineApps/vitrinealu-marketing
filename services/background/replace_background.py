import os
import hashlib
import time
import logging
import io
from typing import Dict, Optional, Any
from abc import ABC, abstractmethod
import yaml
import numpy as np
from PIL import Image
import torch
import torchvision.transforms as T
from torchvision.models.segmentation import deeplabv3_resnet101
import cv2
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from pythonjsonlogger import jsonlogger

# Configure logging
logger = logging.getLogger(__name__)
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

# Load presets
with open(os.path.join(os.path.dirname(__file__), 'presets.yaml'), 'r') as f:
    PRESETS = yaml.safe_load(f)

class BackgroundReplaceEngine(ABC):
    @abstractmethod
    def replace_background(self, image: Image.Image, mask: Image.Image, prompt: str, negative_prompt: str, guidance_scale: float, strength: float, seed: Optional[int]) -> Image.Image:
        pass

class DiffusionEngine(BackgroundReplaceEngine):
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
        # Load model - simplified, in practice load appropriate inpaint model
        # self.pipe = StableDiffusionInpaintPipeline.from_pretrained("runwayml/stable-diffusion-inpainting", torch_dtype=torch.float16 if self.device.type == "cuda" else torch.float32)
        # self.pipe.to(self.device)
        # self.pipe.safety_checker = None if os.getenv("SAFETY_CHECKER", "false").lower() == "false" else self.pipe.safety_checker
        # Placeholder
        self.pipe = None

    def replace_background(self, image: Image.Image, mask: Image.Image, prompt: str, negative_prompt: str, guidance_scale: float, strength: float, seed: Optional[int]) -> Image.Image:
        # Placeholder implementation
        # In practice:
        # generator = torch.Generator(device=self.device).manual_seed(seed) if seed else None
        # result = self.pipe(prompt=prompt, image=image, mask_image=mask, negative_prompt=negative_prompt, guidance_scale=guidance_scale, strength=strength, generator=generator).images[0]
        # return result
        return image  # Placeholder

class RunwayEngine(BackgroundReplaceEngine):
    def __init__(self):
        self.api_key = os.getenv("RUNWAY_API_KEY")
        if not self.api_key:
            raise ValueError("RUNWAY_API_KEY required for RunwayEngine")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10), retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.ConnectError)))
    def _call_api(self, image_data: bytes, prompt: str) -> Dict[str, Any]:
        # Placeholder API call - in practice, this would upload image and poll
        response = httpx.post("https://api.runwayml.com/v1/image_to_image", json={"prompt": prompt, "image": image_data.hex()}, headers={"Authorization": f"Bearer {self.api_key}"})
        response.raise_for_status()
        return response.json()

    def replace_background(self, image: Image.Image, mask: Image.Image, prompt: str, negative_prompt: str, guidance_scale: float, strength: float, seed: Optional[int]) -> Image.Image:
        # Convert to bytes
        img_byte_arr = io.BytesIO()
        image.save(img_byte_arr, format='PNG')
        img_byte_arr = img_byte_arr.getvalue()

        response = self._call_api(img_byte_arr, prompt)
        # Parse response and return image
        # Placeholder
        return image

def generate_mask(image: Image.Image) -> Image.Image:
    # Use DeepLab for foreground segmentation
    model = deeplabv3_resnet101(pretrained=True)
    model.eval()
    transform = T.Compose([
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    input_tensor = transform(image).unsqueeze(0)
    with torch.no_grad():
        output = model(input_tensor)['out'][0]
    output_predictions = output.argmax(0).byte().cpu().numpy()
    # Create mask: 1 for background (to inpaint), 0 for foreground (person)
    foreground_mask = (output_predictions == 15).astype(np.uint8)  # 15 is person class in COCO
    background_mask = 1 - foreground_mask  # Invert: 1 where no person
    mask_img = Image.fromarray(background_mask * 255, mode='L').resize(image.size, Image.NEAREST)
    return mask_img

def replace_background(in_path: str, out_path: str, preset: str, prompt_overrides: Optional[Dict[str, Any]] = None, mask_path: Optional[str] = None, seed: Optional[int] = None) -> Dict[str, Any]:
    start_time = time.time()

    # Load preset
    if preset not in PRESETS:
        raise ValueError(f"Preset {preset} not found")
    config = PRESETS[preset].copy()

    # Apply overrides
    if prompt_overrides:
        config.update(prompt_overrides)

    # Deterministic mode
    if os.getenv("BG_REPLACE_DETERMINISTIC", "false").lower() == "true":
        if seed is None:
            seed = 42  # Fixed seed
        np.random.seed(seed)
        torch.manual_seed(seed)

    # Load image
    image = Image.open(in_path).convert("RGB")

    # Generate or load mask
    if mask_path:
        mask = Image.open(mask_path).convert("L")
    else:
        mask = generate_mask(image)
        mask.save(out_path + ".mask.png")

    # Select engine
    engine_name = os.getenv("BG_REPLACE_ENGINE", "diffusion")
    if engine_name == "diffusion":
        engine = DiffusionEngine()
    elif engine_name == "runway":
        engine = RunwayEngine()
    else:
        raise ValueError(f"Unknown engine {engine_name}")

    # Replace background
    result_image = engine.replace_background(
        image=image,
        mask=mask,
        prompt=config["prompt"],
        negative_prompt=config["negative_prompt"],
        guidance_scale=config["guidance_scale"],
        strength=config["strength"],
        seed=seed
    )

    # Save result
    result_image.save(out_path)

    # Calculate hash
    with open(in_path, "rb") as f:
        input_hash = hashlib.sha256(f.read()).hexdigest()

    elapsed_ms = int((time.time() - start_time) * 1000)

    logger.info("Background replacement completed", extra={
        "engine": engine_name,
        "preset": preset,
        "input_hash": input_hash,
        "output_size": os.path.getsize(out_path),
        "seed": seed,
        "elapsed_ms": elapsed_ms
    })

    return {
        "engine": engine_name,
        "preset": preset,
        "seed": seed,
        "metrics": {"elapsed_ms": elapsed_ms},
        "artifacts": {
            "output": out_path,
            "mask": out_path + ".mask.png" if not mask_path else mask_path
        }
    }