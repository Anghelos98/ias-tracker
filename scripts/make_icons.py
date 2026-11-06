#!/usr/bin/env python3
"""Genera icona, icone Android (adattiva e monocromatica), schermata di avvio e favicon.

Il disegno: un segnaposto bianco con dentro una foglia verde, su fondo verde. È disegnato
in alta risoluzione (4x) e poi ridotto, per bordi morbidi.

Scrive:  assets/icon.png, assets/android-icon-foreground.png, assets/android-icon-background.png,
         assets/android-icon-monochrome.png, assets/splash-icon.png, assets/favicon.png

Uso:  .venv/bin/python scripts/make_icons.py      (richiede Pillow)
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SIZE = 1024
SS = 4  # sovracampionamento

GREEN = (46, 125, 50, 255)        # #2e7d32, colore principale dell'app
DARK_GREEN = (27, 94, 32, 255)    # nervatura della foglia
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def pin_shapes(scale: float):
    """Cerchio e triangolo del segnaposto, centrati nel quadrato; `scale` = altezza / lato."""
    s = SIZE * SS
    height = s * scale
    r = height / 2.9
    d = height - r  # distanza centro-punta
    cx = s / 2
    cy = (s - height) / 2 + r
    k = r / d
    tangent_dx = r * math.sqrt(1 - k * k)
    tangent_dy = r * k
    circle = (cx - r, cy - r, cx + r, cy + r)
    triangle = [(cx - tangent_dx, cy + tangent_dy), (cx, cy + d), (cx + tangent_dx, cy + tangent_dy)]
    return circle, triangle, (cx, cy, r)


def leaf_polygon(cx: float, cy: float, length: float, width: float, angle_deg: float, steps: int = 80):
    """Foglia a fuso inclinata, con punte arrotondate."""
    pts = []
    for i in range(steps + 1):
        t = -1 + 2 * i / steps
        pts.append((t * length / 2, (width / 2) * (1 - t * t) ** 0.8))
    for i in range(steps, -1, -1):
        t = -1 + 2 * i / steps
        pts.append((t * length / 2, -(width / 2) * (1 - t * t) ** 0.8))
    a = math.radians(angle_deg)
    return [(cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)) for x, y in pts]


def draw_mark(img: Image.Image, scale: float, pin_color, leaf_color, rib_color=None) -> None:
    draw = ImageDraw.Draw(img)
    circle, triangle, (cx, cy, r) = pin_shapes(scale)
    draw.ellipse(circle, fill=pin_color)
    draw.polygon(triangle, fill=pin_color)
    leaf = leaf_polygon(cx, cy, length=r * 1.35, width=r * 0.62, angle_deg=-45)
    draw.polygon(leaf, fill=leaf_color)
    if rib_color is not None:
        a = math.radians(-45)
        half = r * 1.35 / 2 * 0.82
        draw.line(
            [(cx - half * math.cos(a), cy - half * math.sin(a)), (cx + half * math.cos(a), cy + half * math.sin(a))],
            fill=rib_color,
            width=int(r * 0.07),
        )


def render(background, scale: float, pin_color, leaf_color, rib_color=None, size: int = SIZE) -> Image.Image:
    img = Image.new("RGBA", (SIZE * SS, SIZE * SS), background)
    draw_mark(img, scale, pin_color, leaf_color, rib_color)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    # iOS / generale: quadrato pieno, senza trasparenze (iOS arrotonda da sé gli angoli)
    icon = render(GREEN, 0.62, WHITE, GREEN, DARK_GREEN).convert("RGB")
    icon.save(ASSETS / "icon.png")
    # Android adattiva: primo piano trasparente entro la zona sicura, sfondo a tinta unita
    render(CLEAR, 0.48, WHITE, GREEN, DARK_GREEN).save(ASSETS / "android-icon-foreground.png")
    Image.new("RGBA", (SIZE, SIZE), GREEN).save(ASSETS / "android-icon-background.png")
    # Android 13+ (icone a tema): sagoma bianca, foglia trasparente
    render(CLEAR, 0.48, WHITE, CLEAR).save(ASSETS / "android-icon-monochrome.png")
    # schermata di avvio: segnaposto verde su sfondo trasparente (lo sfondo lo mette app.json)
    render(CLEAR, 0.8, GREEN, WHITE, None).save(ASSETS / "splash-icon.png")
    # favicon (web)
    icon.resize((48, 48), Image.LANCZOS).save(ASSETS / "favicon.png")
    print("Icone generate in", ASSETS.relative_to(ROOT))


if __name__ == "__main__":
    main()
