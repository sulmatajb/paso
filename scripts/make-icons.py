"""Rasterize Paso's original geometric mark for browser install icons (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1] / 'public'
for size in (180, 192, 512):
    scale = size * 4 / 64
    image = Image.new('RGB', (size * 4, size * 4), '#ec714b')
    draw = ImageDraw.Draw(image)
    def box(values):
        return tuple(round(v * scale) for v in values)
    draw.ellipse(box((18, 12, 46, 40)), fill='#fffaf0')
    draw.rectangle(box((18, 26, 28, 50)), fill='#fffaf0')
    draw.ellipse(box((28, 22, 36, 30)), fill='#ec714b')
    draw.rectangle(box((28, 26, 32, 30)), fill='#ec714b')
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f'icon-{size}.png')
