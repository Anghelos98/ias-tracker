#!/usr/bin/env python3
"""Confini delle regioni semplificati per l'app: servono a capire in quale regione si trova
l'utente quando segnala una pianta, per proporre l'ufficio regionale competente.

Legge:   scripts/data/regioni.json      confini ISTAT (da fetch_istat_regions.py), CC BY 4.0
Scrive:  assets/data/region_shapes.json {"fonte": ..., "regioni": [{"codice", "poligoni": [[[lon, lat], ...]]}]}

Solo gli anelli esterni (le regioni italiane non hanno buchi rilevanti per questo uso, a parte
le enclavi di San Marino e Vaticano, che restano attribuite alla regione circostante).
Semplificazione di circa 500 m: basta per scegliere la regione, non per misurare.

Uso:  python scripts/build_region_shapes.py
"""

from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "data" / "regioni.json"
OUT = ROOT / "assets" / "data" / "region_shapes.json"
TOLERANCE_DEG = 0.005
MIN_AREA_DEG2 = 1e-5  # isolotti più piccoli di ~0,1 km² non servono


def simplify_region(region: dict) -> list[list[list[float]]]:
    rings = []
    for p in region["poligoni"]:
        poly = Polygon(p["esterno"]).simplify(TOLERANCE_DEG, preserve_topology=True)
        if poly.is_empty or poly.area < MIN_AREA_DEG2:
            continue
        rings.append([[round(x, 4), round(y, 4)] for x, y in poly.exterior.coords])
    return rings


def main() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    regions = [{"codice": r["codice"], "poligoni": simplify_region(r)} for r in data["regioni"]]
    OUT.write_text(json.dumps({"fonte": data["fonte"], "regioni": regions}, ensure_ascii=False,
                              separators=(",", ":")), encoding="utf-8")
    points = sum(len(ring) for r in regions for ring in r["poligoni"])
    print(f"{len(regions)} regioni, {points} vertici, {OUT.stat().st_size / 1e3:.0f} kB -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
