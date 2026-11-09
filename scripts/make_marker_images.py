"""Disegna le immagini dei pallini della mappa usate su Android (assets/markers/).

Su Android (Google Maps) un marker con una vista React personalizzata diventa una bitmap
ridisegnata a ogni creazione: con centinaia di pallini la mappa perde fluidità. Un'immagine
invece viene caricata una volta sola e condivisa da tutti i marker che la usano.

Le immagini riproducono i pallini disegnati in src/components/MapMarkers.js (stesse misure e
colori di src/components/markerColors.js): se cambiano lì, aggiornare qui e rilanciare.

Uso: .venv/bin/python scripts/make_marker_images.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "markers"

BOX = 40  # lato del marker in punti (DOT_BOX): è anche l'area che riceve il tocco
DOT = 14  # diametro del pallino in punti
SUPERSAMPLE = 8  # disegno ingrandito e poi ridotto: bordi morbidi

WHITE = "#ffffff"
VERIFIED = "#2e7d32"
AUTOMATIC = "#ef8a00"
APPROXIMATE = "#90a4ae"

# nome: (colore del bordo, spessore del bordo in punti, colore del centro)
VARIANTS = {
    "dot-verified": (WHITE, 2, VERIFIED),
    "dot-automatic": (WHITE, 2, AUTOMATIC),
    "dot-approximate-verified": (VERIFIED, 2.5, APPROXIMATE),
    "dot-approximate-automatic": (AUTOMATIC, 2.5, APPROXIMATE),
}


def draw(border, border_width, fill, scale):
    unit = scale * SUPERSAMPLE
    size = BOX * unit
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size / 2
    outer = DOT * unit / 2
    inner = outer - border_width * unit
    d.ellipse((c - outer, c - outer, c + outer, c + outer), fill=border)
    d.ellipse((c - inner, c - inner, c + inner, c + inner), fill=fill)
    return img.resize((BOX * scale, BOX * scale), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (border, width, fill) in VARIANTS.items():
        for scale in (1, 2, 3):
            suffix = "" if scale == 1 else f"@{scale}x"
            draw(border, width, fill, scale).save(OUT / f"{name}{suffix}.png", optimize=True)
    print(f"Immagini scritte in {OUT}")


if __name__ == "__main__":
    main()
