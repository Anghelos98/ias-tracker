#!/usr/bin/env python3
"""Prepara il sito statico (GitHub Pages) da cui l'app scarica i dati aggiornati.

Legge:   data/index.json               statistiche per specie (da sync_ias_data.py)
         assets/data/species/*.json    punti in formato compatto (da build_app_data.py)
         assets/data/sheets/*.json     schede ISPRA (da fetch_ispra_sheets.py)
         assets/data/grid/*.json       griglia ISPRA 10×10 km (da fetch_ispra_grids.py)
         assets/data/photos.json       foto iNaturalist (da fetch_species_photos.py)
         assets/data/lookalikes.json   specie simili (da build_lookalikes.py)
         assets/data/easin.json        dati europei EASIN (da fetch_easin.py)
Scrive:  <site>/data/v1/manifest.json  indice: statistiche e impronta (sha256) di ogni file
         <site>/data/v1/species/*.json
         <site>/data/v1/sheets/*.json
         <site>/index.html             pagina informativa con fonti e licenze

L'app legge il manifest e scarica solo i file la cui impronta è cambiata.
"v1" è la versione del formato: se cambierà in modo incompatibile si pubblicherà in v2,
così le versioni vecchie dell'app continueranno a funzionare.

Uso:  python scripts/build_site.py _site
"""

from __future__ import annotations

import hashlib
import html
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "data" / "index.json"
SPECIES_DIR = ROOT / "assets" / "data" / "species"
SHEETS_DIR = ROOT / "assets" / "data" / "sheets"
GRID_DIR = ROOT / "assets" / "data" / "grid"
PHOTOS = ROOT / "assets" / "data" / "photos.json"
LOOKALIKES = ROOT / "assets" / "data" / "lookalikes.json"
EASIN = ROOT / "assets" / "data" / "easin.json"
SCHEMA = 1


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def copy_entry(src: Path, dest_dir: Path, rel: str) -> dict | None:
    if not src.exists():
        return None
    dest_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest_dir / src.name)
    return {"file": rel, "sha": sha256(src), "byte": src.stat().st_size}


def main(site: Path) -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    out = site / "data" / f"v{SCHEMA}"
    if out.exists():
        shutil.rmtree(out)

    species = {}
    for s in index["specie"]:
        slug = s["slug"]
        species[slug] = {
            "totale": s["totale"],
            "identificazioni_automatiche": s["identificazioni_automatiche"],
            "anni": s["anni"],
            "bbox": s["bbox"],
            "punti": copy_entry(SPECIES_DIR / f"{slug}.json", out / "species", f"species/{slug}.json"),
            "scheda": copy_entry(SHEETS_DIR / f"{slug}.json", out / "sheets", f"sheets/{slug}.json"),
            "griglia": copy_entry(GRID_DIR / f"{slug}.json", out / "grid", f"grid/{slug}.json"),
        }

    manifest = {
        "schema": SCHEMA,
        "generato_il": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dati_gbif_al": index["aggiornato_il"],
        "totale_segnalazioni": index["totale_segnalazioni"],
        "foto": copy_entry(PHOTOS, out, PHOTOS.name),
        "simili": copy_entry(LOOKALIKES, out, LOOKALIKES.name),
        "europa": copy_entry(EASIN, out, EASIN.name),
        "specie": species,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    (site / ".nojekyll").write_text("", encoding="utf-8")
    (site / "index.html").write_text(index_page(manifest), encoding="utf-8")

    size = sum(p.stat().st_size for p in out.rglob("*.json"))
    print(f"Sito in {site}: {len(species)} specie, {size / 1e6:.1f} MB di dati, "
          f"{manifest['totale_segnalazioni']} segnalazioni (GBIF al {manifest['dati_gbif_al']})")


def index_page(manifest: dict) -> str:
    date = html.escape(manifest["dati_gbif_al"][:10])
    total = f"{manifest['totale_segnalazioni']:,}".replace(",", ".")
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IAS Tracker – dati</title>
<style>body{{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5;color:#1b1b1b}}a{{color:#2e7d32}}code{{background:#f1f3f4;padding:1px 4px;border-radius:4px}}</style>
</head>
<body>
<h1>IAS Tracker – dati</h1>
<p>Dati usati dall'app <a href="https://github.com/Anghelos98/ias-tracker">IAS Tracker</a>,
gratuita e open source: segnalazioni in Italia delle piante esotiche invasive di rilevanza unionale.</p>
<p><strong>{total}</strong> segnalazioni, dati GBIF aggiornati al <strong>{date}</strong>.
Indice dei file: <a href="data/v{SCHEMA}/manifest.json"><code>data/v{SCHEMA}/manifest.json</code></a>.</p>
<h2>Fonti e licenze</h2>
<ul>
<li>Segnalazioni: <a href="https://www.gbif.org">GBIF.org</a>. Ogni record mantiene la licenza del dataset di origine
(CC0, CC BY o CC BY-NC), riportata nei file insieme al nome del dataset.</li>
<li>Schede delle specie: <a href="https://www.specieinvasive.isprambiente.it">ISPRA</a>, licenza CC BY 4.0.</li>
</ul>
<p>Dettagli in <a href="https://github.com/Anghelos98/ias-tracker/blob/main/DATI.md">DATI.md</a>.</p>
</body>
</html>
"""


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Uso: python scripts/build_site.py <cartella_sito>")
    main(Path(sys.argv[1]).resolve())
