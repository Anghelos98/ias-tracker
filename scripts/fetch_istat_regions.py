#!/usr/bin/env python3
"""Confini delle regioni italiane (ISTAT) per assegnare ogni segnalazione alla sua regione.

ISTAT pubblica i "Confini delle unità amministrative a fini statistici" (versione
generalizzata, UTM 32N / EPSG:32632). Lo script scarica il file del 1° gennaio dell'anno
indicato, prende le 20 regioni, le converte in coordinate geografiche (WGS84) con una
semplificazione di circa 50 m (abbondantemente sotto la precisione delle segnalazioni) e
salva il risultato nel repository: i confini cambiano di rado, quindi lo script si esegue a
mano e non nel workflow settimanale.

Licenza: dati ISTAT, CC BY 4.0. Modifiche: geometrie semplificate e convertite in WGS84.

Scrive:  scripts/data/regioni.json   {"fonte": {...}, "regioni": [{"codice", "nome", "bbox", "poligoni"}]}
         src/data/regions.js         nomi e riquadri delle regioni per l'app

Uso:  .venv/bin/python scripts/fetch_istat_regions.py [anno]
Richiede: requests, pyshp, pyproj, shapely
"""

from __future__ import annotations

import json
import sys
import tempfile
from datetime import date
from pathlib import Path

import numpy as np
import requests
import shapefile
import shapely
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, shape

from net_safety import extract_zip_limited, get_limited

ROOT = Path(__file__).resolve().parent.parent
OUT_DATA = ROOT / "scripts" / "data" / "regioni.json"
OUT_JS = ROOT / "src" / "data" / "regions.js"
URL = "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/{y}/Limiti0101{y}_g.zip"
PAGE = "https://www.istat.it/notizia/confini-delle-unita-amministrative-a-fini-statistici-al-1-gennaio-2018-2/"
SIMPLIFY_M = 50
# Archivio ISTAT dei confini generalizzati: oggi qualche decina di MB. Limiti larghi contro file
# enormi o zip bomb.
MAX_ZIP_BYTES = 300 * 1024 * 1024
MAX_ZIP_FILES = 500
MAX_ZIP_EXTRACTED = 2 * 1024 * 1024 * 1024

# Nomi brevi in italiano (il file ISTAT riporta anche le denominazioni bilingui).
SHORT_NAMES = {
    2: "Valle d'Aosta",
    4: "Trentino-Alto Adige",
}


def to_polygons(geom) -> list[Polygon]:
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return []


def round_ring(coords) -> list[list[float]]:
    return [[round(x, 5), round(y, 5)] for x, y in coords]


def region_entry(code: int, name: str, geom_utm) -> dict:
    transformer = Transformer.from_crs("EPSG:32632", "EPSG:4326", always_xy=True)
    simple = geom_utm.simplify(SIMPLIFY_M, preserve_topology=True)
    wgs = shapely.transform(simple, lambda c: np.column_stack(transformer.transform(c[:, 0], c[:, 1])))
    polygons = [
        {"esterno": round_ring(p.exterior.coords), "buchi": [round_ring(h.coords) for h in p.interiors]}
        for p in to_polygons(wgs)
    ]
    west, south, east, north = wgs.bounds
    return {
        "codice": code,
        "nome": SHORT_NAMES.get(code, name),
        "bbox": [round(west, 4), round(south, 4), round(east, 4), round(north, 4)],
        "poligoni": polygons,
    }


def regions_js(regions: list[dict], source: dict) -> str:
    lines = [
        "// File generato da scripts/fetch_istat_regions.py - non modificare a mano.",
        f"// Confini: {source['attribuzione']}, licenza {source['licenza']}.",
        "",
        "/** Regioni italiane (codice ISTAT, nome, riquadro [ovest, sud, est, nord]). */",
        "export const REGIONS = [",
    ]
    for r in regions:
        lines.append(f"  {{ code: {r['codice']}, name: {json.dumps(r['nome'], ensure_ascii=False)}, bbox: {json.dumps(r['bbox'])} }},")
    lines += ["];", ""]
    return "\n".join(lines)


def main(year: int) -> None:
    url = URL.format(y=year)
    print(f"Scarico {url}")
    with requests.Session() as session:
        response = get_limited(session, url, MAX_ZIP_BYTES, timeout=(10, 180))
    with tempfile.TemporaryDirectory() as tmp:
        extract_zip_limited(response.content, tmp, max_files=MAX_ZIP_FILES, max_total_bytes=MAX_ZIP_EXTRACTED)
        shp = next(Path(tmp).rglob(f"Reg0101{year}_g_WGS84.shp"))
        reader = shapefile.Reader(str(shp), encoding="utf-8")
        fields = [f[0] for f in reader.fields[1:]]
        regions = []
        for sr in reader.iterShapeRecords():
            rec = dict(zip(fields, sr.record))
            regions.append(region_entry(int(rec["COD_REG"]), rec["DEN_REG"], shape(sr.shape.__geo_interface__)))
    regions.sort(key=lambda r: r["codice"])
    if len(regions) != 20:
        raise SystemExit(f"Attese 20 regioni, trovate {len(regions)}")

    source = {
        "attribuzione": f"ISTAT, Confini delle unità amministrative a fini statistici al 1° gennaio {year}",
        "licenza": "CC BY 4.0",
        "modifiche": f"geometrie semplificate (~{SIMPLIFY_M} m) e convertite in WGS84",
        "url": PAGE,
        "recuperato_il": date.today().isoformat(),
    }
    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_DATA.write_text(json.dumps({"fonte": source, "regioni": regions}, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
    OUT_JS.write_text(regions_js(regions, source), encoding="utf-8")
    print(f"{len(regions)} regioni -> {OUT_DATA.relative_to(ROOT)} "
          f"({OUT_DATA.stat().st_size / 1e6:.1f} MB), {OUT_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else date.today().year)
