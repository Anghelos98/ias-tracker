#!/usr/bin/env python3
"""Prepara i dati per l'app IAS Tracker a partire dall'output di sync_ias_data.py.

Legge:   data/index.json, data/species/<slug>.geojson
Scrive:  assets/data/species/<slug>.json   punti in formato compatto
         src/data/species.js                catalogo delle 49 specie + loader lazy

Formato compatto di un file specie:
    {"fonti": ["iNaturalist ...", ...],
     "punti": [[lon, lat, anno|null, indice_fonte, auto(0/1), incertezza_m|null], ...]}

Metro (il bundler di Expo) accetta solo require() statici: per questo il catalogo
contiene una funzione `load` per specie con un require esplicito. Il file JSON
viene valutato solo alla prima chiamata, cioè quando l'utente seleziona la specie.

Uso:  python scripts/build_app_data.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "data" / "index.json"
GEOJSON_DIR = ROOT / "data" / "species"
OUT_DATA = ROOT / "assets" / "data" / "species"
OUT_JS = ROOT / "src" / "data" / "species.js"

# Nomi comuni italiani (fonte: ISPRA, specieinvasive.isprambiente.it).
# Dove ISPRA non riporta un nome italiano si usa il nome inglese.
COMMON_NAMES = {
    "Acacia mearnsii": "Mimosa nera",
    "Acacia saligna": "Acacia saligna",
    "Ailanthus altissima": "Ailanto",
    "Alternanthera philoxeroides": "Erba degli alligatori",
    "Andropogon virginicus": "Andropogon della Virginia",
    "Asclepias syriaca": "Pianta dei pappagalli",
    "Baccharis halimifolia": "Baccharis a foglie di alimio",
    "Broussonetia papyrifera": "Gelso da carta",
    "Cabomba caroliniana": "Cabomba della Carolina",
    "Cardiospermum grandiflorum": "Cardiospermo a fiori grandi",
    "Celastrus orbiculatus": "Oriental bittersweet",
    "Cenchrus setaceus": "Penniseto setaceo",
    "Cortaderia jubata": "Cortaderia a fiori rosa",
    "Crassula helmsii": "Erba grassa di Helms",
    "Delairea odorata": "Edera del Capo",
    "Ehrharta calycina": "Erba di Ehrhart",
    "Elodea nuttallii": "Peste d'acqua di Nuttall",
    "Gunnera tinctoria": "Rabarbaro gigante",
    "Gymnocoronis spilanthoides": "Palla di neve",
    "Hakea sericea s.l.": "Silky hakea",
    "Heracleum mantegazzianum": "Panace di Mantegazza",
    "Heracleum persicum": "Panace della Persia",
    "Heracleum sosnowskyi": "Panace di Sosnowsky",
    "Humulus scandens": "Luppolo del Giappone",
    "Hydrocotyle ranunculoides": "Soldinella reniforme",
    "Impatiens glandulifera": "Balsamina ghiandolosa",
    "Koenigia polystachya": "Poligono dell'Himalaya",
    "Lagarosiphon major": "Peste d'acqua arcuata",
    "Lespedeza cuneata": "Lespedeza",
    "Ludwigia grandiflora": "Ludwigia a fiori grandi",
    "Ludwigia peploides": "Ludwigia peploide",
    "Lygodium japonicum": "Felce rampicante del Giappone",
    "Lysichiton americanus": "Lysichiton americano",
    "Microstegium vimineum": "Stiltgrass giapponese",
    "Myriophyllum aquaticum": "Millefoglio d'acqua brasiliano",
    "Myriophyllum heterophyllum": "Millefoglio",
    "Nanozostera japonica": "Japanese eelgrass",
    "Parthenium hysterophorus": "Partenio infestante",
    "Persicaria perfoliata": "Stracciabraghe asiatico",
    "Pistia stratiotes": "Lattuga d'acqua",
    "Pontederia crassipes": "Giacinto d'acqua",
    "Prosopis juliflora": "Prosopis a fioritura estiva",
    "Pueraria montana var. lobata": "Kudzu",
    "Reynoutria japonica": "Poligono del Giappone",
    "Reynoutria sachalinensis": "Poligono di Sachalin",
    "Reynoutria × bohemica": "Poligono di Boemia",
    "Rugulopteryx okamurae": "Rugulopteryx (alga bruna)",
    "Salvinia molesta": "Erba pesce gigante",
    "Triadica sebifera": "Albero del sego",
}


def compact(geojson: dict) -> dict:
    sources: list[str] = []
    source_idx: dict[str, int] = {}
    points = []
    for f in geojson["features"]:
        lon, lat = f["geometry"]["coordinates"]
        p = f["properties"]
        src = p.get("dataset") or "Fonte sconosciuta"
        if src not in source_idx:
            source_idx[src] = len(sources)
            sources.append(src)
        unc = p.get("incertezza_m")
        points.append([round(lon, 5), round(lat, 5), p.get("anno"), source_idx[src],
                       1 if p.get("identificazione_automatica") else 0,
                       round(unc) if unc is not None else None])
    return {"fonti": sources, "punti": points}


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    for old in OUT_DATA.glob("*.json"):
        old.unlink()

    entries = []
    for s in index["specie"]:
        name, slug = s["nome_scientifico"], s["slug"]
        if name not in COMMON_NAMES:
            raise SystemExit(f"Manca il nome comune per {name}")
        has_data = bool(s["totale"])
        if has_data:
            data = compact(json.loads((GEOJSON_DIR / f"{slug}.geojson").read_text(encoding="utf-8")))
            (OUT_DATA / f"{slug}.json").write_text(
                json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        entries.append((name, slug, s, has_data))

    entries.sort(key=lambda e: COMMON_NAMES[e[0]].lower())
    lines = [
        "// File generato da scripts/build_app_data.py - non modificare a mano.",
        f"// Dati GBIF aggiornati al {index['aggiornato_il']}.",
        "",
        "export const DATA_UPDATED_AT = " + json.dumps(index["aggiornato_il"]) + ";",
        "",
        "export const SPECIES = [",
    ]
    for name, slug, s, has_data in entries:
        meta = {
            "slug": slug,
            "scientificName": name,
            "commonName": COMMON_NAMES[name],
            "family": s.get("famiglia"),
            "total": s["totale"],
            "automatic": s["identificazioni_automatiche"],
            "years": s["anni"],
            "bbox": s["bbox"],
        }
        body = json.dumps(meta, ensure_ascii=False)[1:-1]
        loader = f"() => require('../../assets/data/species/{slug}.json')" if has_data else "null"
        lines.append(f"  {{ {body}, load: {loader} }},")
    lines += ["];", ""]
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text("\n".join(lines), encoding="utf-8")

    size = sum(p.stat().st_size for p in OUT_DATA.glob("*.json"))
    print(f"{len(entries)} specie nel catalogo, {sum(e[3] for e in entries)} file dati "
          f"({size / 1e6:.1f} MB) -> {OUT_DATA.relative_to(ROOT)}, {OUT_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
