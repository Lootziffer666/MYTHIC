#!/usr/bin/env python3
"""Generate transparent MYTHIC landing-page WebM loops.

The script is intentionally self-contained except for Pillow and ffmpeg so the
binary assets can be recreated locally without external design tools.
"""

from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError as exc:  # pragma: no cover - developer convenience path
    raise SystemExit("Install Pillow first: python3 -m pip install pillow") from exc

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "mythic-videos"
SIZE = (960, 540)
FRAMES = 72
FPS = 24


def glow(draw: ImageDraw.ImageDraw, xy: tuple[float, float], r: float, color: tuple[int, int, int, int]) -> None:
    x, y = xy
    draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def frame_clouds(i: int) -> Image.Image:
    img = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    layer = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    t = i / FRAMES
    for n in range(18):
        x = (n * 137 + t * 140) % (SIZE[0] + 220) - 110
        y = 110 + math.sin(t * math.tau + n) * 45 + (n % 5) * 48
        r = 95 + (n % 4) * 24
        glow(d, (x, y), r, (132, 92, 255, 18))
        glow(d, (x + 42, y + 12), r * 0.7, (45, 212, 255, 14))
    return Image.alpha_composite(img, layer.filter(ImageFilter.GaussianBlur(24)))


def frame_gate(i: int) -> Image.Image:
    img = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    t = i / FRAMES
    cx, cy = SIZE[0] // 2, SIZE[1] // 2 + 8
    for n in range(9):
        r = 58 + n * 27 + math.sin(t * math.tau + n) * 4
        alpha = max(18, 130 - n * 11)
        color = (255, 204, 97, alpha)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=3)
    sweep = t * math.tau
    for n in range(20):
        a = sweep + n * 0.19
        r = 82 + n * 7
        x = cx + math.cos(a) * r
        y = cy + math.sin(a) * r * 0.62
        glow(d, (x, y), 7, (255, 235, 160, 145))
    return img.filter(ImageFilter.GaussianBlur(0.4))


def frame_soul(i: int) -> Image.Image:
    img = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    t = i / FRAMES
    for n in range(32):
        phase = (t + n / 32) % 1
        x = SIZE[0] * (0.18 + 0.64 * phase)
        y = SIZE[1] * (0.76 - 0.55 * math.sin(phase * math.pi)) + math.sin(n) * 26
        glow(d, (x, y), 5 + 5 * math.sin(phase * math.pi), (125, 255, 213, int(170 * (1 - phase))))
    glow(d, (SIZE[0] * 0.78, SIZE[1] * 0.32), 44 + 10 * math.sin(t * math.tau), (255, 255, 255, 78))
    return img.filter(ImageFilter.GaussianBlur(0.7))


def render(name: str, factory) -> None:
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is required to encode WebM files")
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for i in range(FRAMES):
            factory(i).save(tmp / f"frame-{i:04d}.png")
        subprocess.run([
            "ffmpeg", "-y", "-framerate", str(FPS), "-i", str(tmp / "frame-%04d.png"),
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
            "-b:v", "0", "-crf", "34", str(OUT / name),
        ], check=True)


def main() -> None:
    render("volumetric-clouds-alpha.webm", frame_clouds)
    render("golden-gate-alpha.webm", frame_gate)
    render("soul-return-alpha.webm", frame_soul)


if __name__ == "__main__":
    main()
