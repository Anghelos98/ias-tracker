#!/usr/bin/env python3
"""Prepara i dati per l'app IAS Tracker a partire dall'output di sync_ias_data.py.

Legge:   data/index.json, data/species/<slug>.geojson
Scrive:  assets/data/species/<slug>.json   punti in formato compatto
         src/data/species.js                catalogo delle 49 specie + loader lazy

Formato compatto di un file specie:
    {"fonti": [{"nome": "iNaturalist ...", "licenza": "CC BY-NC 4.0"}, ...],
     "punti": [[lon, lat, anno|null, indice_fonte, auto(0/1), incertezza_m|null, regione|null], ...]}

"regione" è il codice ISTAT (1-20) della regione in cui cade il punto, calcolato con i
confini di scripts/data/regioni.json (da fetch_istat_regions.py). I punti appena fuori
dalla costa (entro REGION_TOLERANCE_KM) vanno alla regione più vicina; quelli in mare
aperto restano senza regione.

Metro (il bundler di Expo) accetta solo require() statici: per questo il catalogo
contiene una funzione `load` per specie con un require esplicito. Il file JSON
viene valutato solo alla prima chiamata, cioè quando l'utente seleziona la specie.

Uso:  python scripts/build_app_data.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from shapely import STRtree
from shapely.geometry import Point, Polygon

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


# Regolamento di esecuzione che ha inserito la specie nell'elenco dell'Unione e data di
# entrata in vigore (20 giorni dopo la pubblicazione in GUUE). "applies_from" solo per le
# specie con applicazione differita dei divieti (Reg. 2022/1203: dal 2 agosto 2027).
REGULATIONS = {
    "2016/1141": "2016-08-03",
    "2017/1263": "2017-08-02",
    "2019/1262": "2019-08-15",
    "2022/1203": "2022-08-02",
    "2025/1422": "2025-08-07",
}
LISTING = {
    "2016/1141": ["Baccharis halimifolia", "Cabomba caroliniana", "Pontederia crassipes",
                  "Heracleum persicum", "Heracleum sosnowskyi", "Hydrocotyle ranunculoides",
                  "Lagarosiphon major", "Ludwigia grandiflora", "Ludwigia peploides",
                  "Lysichiton americanus", "Myriophyllum aquaticum", "Parthenium hysterophorus",
                  "Persicaria perfoliata", "Pueraria montana var. lobata"],
    "2017/1263": ["Alternanthera philoxeroides", "Asclepias syriaca", "Elodea nuttallii",
                  "Gunnera tinctoria", "Heracleum mantegazzianum", "Impatiens glandulifera",
                  "Microstegium vimineum", "Myriophyllum heterophyllum", "Cenchrus setaceus"],
    "2019/1262": ["Acacia saligna", "Ailanthus altissima", "Andropogon virginicus",
                  "Cardiospermum grandiflorum", "Cortaderia jubata", "Ehrharta calycina",
                  "Gymnocoronis spilanthoides", "Humulus scandens", "Lygodium japonicum",
                  "Prosopis juliflora", "Salvinia molesta", "Triadica sebifera"],
    "2022/1203": ["Celastrus orbiculatus", "Hakea sericea s.l.", "Koenigia polystachya",
                  "Lespedeza cuneata", "Pistia stratiotes", "Rugulopteryx okamurae"],
    "2025/1422": ["Acacia mearnsii", "Broussonetia papyrifera", "Crassula helmsii",
                  "Delairea odorata", "Nanozostera japonica", "Reynoutria japonica",
                  "Reynoutria sachalinensis", "Reynoutria × bohemica"],
}
DEFERRED = {"Celastrus orbiculatus": "2027-08-02", "Rugulopteryx okamurae": "2027-08-02"}
SPECIES_LISTING = {name: reg for reg, names in LISTING.items() for name in names}

SHEETS_DIR = ROOT / "assets" / "data" / "sheets"
REGIONS_FILE = ROOT / "scripts" / "data" / "regioni.json"
REGION_TOLERANCE_KM = 3
GRID_DIR = ROOT / "assets" / "data" / "grid"


class RegionLocator:
    """Trova la regione (codice ISTAT) di un punto [lon, lat]."""

    def __init__(self, regions: list[dict]) -> None:
        self.polygons: list[Polygon] = []
        self.codes: list[int] = []
        for r in regions:
            for p in r["poligoni"]:
                self.polygons.append(Polygon(p["esterno"], p["buchi"]))
                self.codes.append(r["codice"])
        self.tree = STRtree(self.polygons)

    @classmethod
    def from_file(cls, path: Path = REGIONS_FILE) -> "RegionLocator":
        return cls(json.loads(path.read_text(encoding="utf-8"))["regioni"])

    def locate(self, lon: float, lat: float) -> int | None:
        point = Point(lon, lat)
        inside = self.tree.query(point, predicate="intersects")
        if len(inside):
            return self.codes[int(inside[0])]
        # gradi -> km: la longitudine si accorcia con la latitudine
        tolerance = REGION_TOLERANCE_KM / (111.32 * math.cos(math.radians(lat)))
        near = self.tree.query(point, predicate="dwithin", distance=tolerance)
        if not len(near):
            return None
        best = min(near, key=lambda i: self.polygons[int(i)].distance(point))
        return self.codes[int(best)]


def compact(geojson: dict, locator: RegionLocator | None = None) -> dict:
    sources: list[dict] = []
    source_idx: dict[tuple, int] = {}
    points = []
    for f in geojson["features"]:
        lon, lat = f["geometry"]["coordinates"]
        p = f["properties"]
        src = (p.get("dataset") or "Fonte sconosciuta", p.get("licenza"))
        if src not in source_idx:
            source_idx[src] = len(sources)
            sources.append({"nome": src[0], "licenza": src[1]})
        unc = p.get("incertezza_m")
        points.append([round(lon, 5), round(lat, 5), p.get("anno"), source_idx[src],
                       1 if p.get("identificazione_automatica") else 0,
                       round(unc) if unc is not None else None,
                       locator.locate(lon, lat) if locator else None])
    return {"fonti": sources, "punti": points}


def main() -> None:
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    for old in OUT_DATA.glob("*.json"):
        old.unlink()

    locator = RegionLocator.from_file()
    entries = []
    for s in index["specie"]:
        name, slug = s["nome_scientifico"], s["slug"]
        if name not in COMMON_NAMES:
            raise SystemExit(f"Manca il nome comune per {name}")
        if name not in SPECIES_LISTING:
            raise SystemExit(f"Manca il regolamento di inserimento per {name}")
        has_data = bool(s["totale"])
        if has_data:
            data = compact(json.loads((GEOJSON_DIR / f"{slug}.geojson").read_text(encoding="utf-8")), locator)
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
            "listing": {
                "regulation": SPECIES_LISTING[name],
                "inForce": REGULATIONS[SPECIES_LISTING[name]],
                "appliesFrom": DEFERRED.get(name),
            },
        }
        body = json.dumps(meta, ensure_ascii=False)[1:-1]
        loader = f"() => require('../../assets/data/species/{slug}.json')" if has_data else "null"
        sheet = (f"() => require('../../assets/data/sheets/{slug}.json')"
                 if (SHEETS_DIR / f"{slug}.json").exists() else "null")
        grid = (f"() => require('../../assets/data/grid/{slug}.json')"
                if (GRID_DIR / f"{slug}.json").exists() else "null")
        lines.append(f"  {{ {body}, load: {loader}, sheet: {sheet}, grid: {grid} }},")
    lines += ["];", ""]
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text("\n".join(lines), encoding="utf-8")

    size = sum(p.stat().st_size for p in OUT_DATA.glob("*.json"))
    print(f"{len(entries)} specie nel catalogo, {sum(e[3] for e in entries)} file dati "
          f"({size / 1e6:.1f} MB) -> {OUT_DATA.relative_to(ROOT)}, {OUT_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
