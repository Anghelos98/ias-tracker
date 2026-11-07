#!/usr/bin/env python3
"""Griglia ufficiale ISPRA (celle 10×10 km) della distribuzione di ogni specie in Italia.

ISPRA pubblica per molte specie lo shapefile della distribuzione su celle 10×10 km della
griglia europea (ETRS89-LAEA, EPSG:3035), aggiornato a giugno 2025 per la rendicontazione
art. 24 del Reg. UE 1143/2014. Lo script lo scarica, unisce le celle adiacenti in poche aree
(un poligono con eventuali buchi è molto più leggero da disegnare di migliaia di quadrati),
lo converte in coordinate geografiche (WGS84) e lo salva per l'app.

Licenza: dati ISPRA, CC BY 4.0.

Legge:   assets/data/sheets/<slug>.json   (link "shapefile_distribuzione", da fetch_ispra_sheets.py)
Scrive:  assets/data/grid/<slug>.json     {"celle": N, "poligoni": [{"esterno": [[lon, lat], ...], "buchi": [...]}]}

Uso:  .venv/bin/python scripts/fetch_ispra_grids.py
Richiede: requests, pyshp, pyproj, shapely
"""

from __future__ import annotations

import io
import json
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import numpy as np
import requests
import shapefile
import shapely
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
SHEETS_DIR = ROOT / "assets" / "data" / "sheets"
OUT_DIR = ROOT / "assets" / "data" / "grid"

HEADERS = {"User-Agent": "IAS-Tracker/1.0 (https://github.com/Anghelos98/ias-tracker)"}
REQUEST_DELAY_S = 1.0
SEGMENT_M = 10_000  # i lati lunghi vengono suddivisi ogni 10 km prima della conversione
DECIMALS = 5        # ~1 m

TO_WGS84 = Transformer.from_crs("EPSG:3035", "EPSG:4326", always_xy=True)


def read_cells(zip_bytes: bytes) -> tuple[list[Polygon], set[str]]:
    """Celle in cui la specie è presente (in metri, EPSG:3035) e i loro codici.

    Ogni shapefile ISPRA contiene l'intera griglia italiana (16.800 celle): la presenza della
    specie è indicata dal campo "Species" compilato.
    """
    with tempfile.TemporaryDirectory() as tmp:
        zipfile.ZipFile(io.BytesIO(zip_bytes)).extractall(tmp)
        shp = next(Path(tmp).rglob("*.shp"))
        reader = shapefile.Reader(str(shp))
        fields = [f[0].lower() for f in reader.fields[1:]]  # i nomi variano (CellCode / CELLCODE)
        code_idx = fields.index("cellcode")
        species_idx = fields.index("species")
        cells, codes = [], set()
        for sr in reader.shapeRecords():
            if not str(sr.record[species_idx]).strip():
                continue  # cella senza la specie
            cells.append(shape(sr.shape.__geo_interface__))
            codes.add(sr.record[code_idx])
        return cells, codes


def to_wgs84(coords: np.ndarray) -> np.ndarray:
    lon, lat = TO_WGS84.transform(coords[:, 0], coords[:, 1])
    return np.column_stack([lon, lat])


def ring(coords) -> list[list[float]]:
    return [[round(x, DECIMALS), round(y, DECIMALS)] for x, y in coords]


def previous_cells(path: Path) -> int:
    """Celle della griglia già salvata (0 se assente o illeggibile)."""
    try:
        return int(json.loads(path.read_text(encoding="utf-8")).get("celle", 0))
    except (OSError, ValueError, TypeError, AttributeError):
        return 0


def to_polygons(cells: list[Polygon]) -> list[dict]:
    """Unisce le celle, suddivide i lati lunghi e converte in WGS84."""
    if not cells:
        return []
    merged = unary_union(cells)
    polys = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
    result = []
    for poly in polys:
        poly = shapely.transform(poly.segmentize(SEGMENT_M), to_wgs84)
        result.append({
            "esterno": ring(poly.exterior.coords),
            "buchi": [ring(h.coords) for h in poly.interiors],
        })
    return result


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update(HEADERS)
    written, failed = 0, []
    for sheet_path in sorted(SHEETS_DIR.glob("*.json")):
        slug = sheet_path.stem
        sheet = json.loads(sheet_path.read_text(encoding="utf-8"))
        url = sheet.get("shapefile_distribuzione")
        out = OUT_DIR / f"{slug}.json"
        if not url:
            continue
        try:
            response = session.get(url, timeout=60)
            response.raise_for_status()
            cells, codes = read_cells(response.content)
            polygons = to_polygons(cells)
        except Exception as exc:  # file mancante, corrotto o non leggibile: si tiene il precedente
            print(f"  ! {slug}: {exc}")
            failed.append(slug)
            continue
        finally:
            time.sleep(REQUEST_DELAY_S)
        if not codes and previous_cells(out):
            # file letto ma senza celle per la specie: probabile cambio di formato, si tiene il precedente
            print(f"  ! {slug}: nessuna cella nel file ISPRA, tengo la griglia precedente")
            failed.append(slug)
            continue
        payload = {
            "celle": len(codes),
            "aggiornamento": "giugno 2025",
            "fonte": {"attribuzione": "ISPRA – specieinvasive.isprambiente.it", "licenza": "CC BY 4.0", "url": url},
            "poligoni": polygons,
        }
        out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        written += 1
        vertices = sum(len(p["esterno"]) + sum(len(h) for h in p["buchi"]) for p in polygons)
        print(f"  {slug}: {payload['celle']} celle -> {len(polygons)} aree, {vertices} vertici, "
              f"{out.stat().st_size / 1000:.0f} KB")

    print(f"\n{written} griglie salvate in {OUT_DIR.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
