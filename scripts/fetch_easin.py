#!/usr/bin/env python3
"""Dati europei sulle specie dal catalogo EASIN (European Alien Species Information Network, JRC).

Per ogni specie: paesi UE in cui è presente, prima introduzione in Europa, vie di introduzione
e settori su cui ha impatti. Completano le schede ISPRA, in particolare quelle ancora incomplete.

Fonte: API pubblica https://easin.jrc.ec.europa.eu/apixg (senza chiave). I dati si possono
riusare citando EASIN; i contenuti della Commissione europea sono CC BY 4.0.

Legge:   ias_reference.json
Scrive:  assets/data/easin.json

Uso:  .venv/bin/python scripts/fetch_easin.py
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "ias_reference.json"
OUTPUT = ROOT / "assets" / "data" / "easin.json"

API = "https://easin.jrc.ec.europa.eu/apixg/catxg"
FACTSHEET = "https://easin.jrc.ec.europa.eu/spexplorer/species/factsheet/{}"
HEADERS = {"User-Agent": "AlienHub/1.0 (https://github.com/Anghelos98/ias-tracker)"}
REQUEST_DELAY_S = 1.0

PATHWAY_CATEGORIES = {
    "RELEASE IN NATURE": "Rilascio intenzionale in natura",
    "ESCAPE FROM CONFINEMENT": "Fuga da coltivazioni, giardini, acquari o allevamenti",
    "TRANSPORT - CONTAMINANT": "Trasporto involontario come contaminante",
    "TRANSPORT - STOWAWAY": "Trasporto involontario con mezzi e merci",
    "CORRIDOR": "Diffusione lungo corridoi (canali, infrastrutture)",
    "UNAIDED": "Diffusione spontanea da aree vicine",
}

SECTORS = {
    "Agriculture": "Agricoltura",
    "Animal health": "Salute animale",
    "Aquaculture": "Acquacoltura",
    "Clean water": "Qualità dell'acqua",
    "Fisheries": "Pesca",
    "Forestry": "Selvicoltura",
    "Green Gas emissions": "Emissioni di gas serra",
    "Human health": "Salute umana",
    "Infrastructure (road, rails)": "Infrastrutture (strade, ferrovie)",
    "Infrastructure (buildings, dams, dykes)": "Infrastrutture (edifici, argini, dighe)",
    "Nature protection and restoration": "Conservazione della natura",
    "Recreation and tourism": "Turismo e tempo libero",
    "Tourism": "Turismo",
    "Shipping": "Navigazione",
    "Water supply": "Approvvigionamento idrico",
    "Plant health": "Salute delle piante",
    "Soil": "Suolo",
    "Inland waters": "Acque interne",
    "Security and safety": "Sicurezza",
    "Urban areas/regions": "Aree urbane",
    "Internal market/trade": "Commercio",
    "Renewable energy": "Energie rinnovabili",
    "Energy": "Energia",
    "Marine environmental status": "Ambiente marino",
    "Small and Medium Enterprises (SMEs)": "Piccole e medie imprese",
}
LEVELS = {"HIGH": "alto", "MEDIUM": "medio", "LOW": "basso"}

EU_COUNTRIES = {
    "AT": "Austria", "BE": "Belgio", "BG": "Bulgaria", "CY": "Cipro", "CZ": "Cechia", "DE": "Germania",
    "DK": "Danimarca", "EE": "Estonia", "EL": "Grecia", "GR": "Grecia", "ES": "Spagna", "FI": "Finlandia",
    "FR": "Francia", "HR": "Croazia", "HU": "Ungheria", "IE": "Irlanda", "IT": "Italia", "LT": "Lituania",
    "LU": "Lussemburgo", "LV": "Lettonia", "MT": "Malta", "NL": "Paesi Bassi", "PL": "Polonia",
    "PT": "Portogallo", "RO": "Romania", "SE": "Svezia", "SI": "Slovenia", "SK": "Slovacchia",
    "UK": "Regno Unito",
    # altri paesi europei e del Mediterraneo coperti da EASIN
    "AL": "Albania", "AM": "Armenia", "AZ": "Azerbaigian", "BA": "Bosnia ed Erzegovina", "BY": "Bielorussia",
    "CH": "Svizzera", "DZ": "Algeria", "EG": "Egitto", "FO": "Isole Fær Øer", "GE": "Georgia",
    "GG": "Guernsey", "GI": "Gibilterra", "IL": "Israele", "IM": "Isola di Man", "IS": "Islanda",
    "JE": "Jersey", "LB": "Libano", "LI": "Liechtenstein", "LY": "Libia", "MA": "Marocco", "MC": "Monaco",
    "MD": "Moldavia", "ME": "Montenegro", "MK": "Macedonia del Nord", "NO": "Norvegia", "PS": "Palestina",
    "RS": "Serbia", "RU": "Russia", "SM": "San Marino", "SY": "Siria", "TN": "Tunisia", "TR": "Turchia",
    "UA": "Ucraina",
}

# Specie che EASIN registra con un altro nome: (termine di ricerca, nome esatto del record).
EASIN_NAMES = {
    "Cortaderia jubata": ("Cortaderia", "Cortaderia selloana subsp. jubata"),
    "Prosopis juliflora": ("Neltuma juliflora", "Neltuma juliflora"),
}


def slugify(name: str) -> str:
    """Stessa regola di sync_ias_data.py."""
    name = name.replace("×", "x")
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def query_name(name: str) -> str:
    """'Hakea sericea s.l.' -> 'Hakea sericea'; 'Pueraria montana var. lobata' -> 'Pueraria montana'."""
    if name in EASIN_NAMES:
        return EASIN_NAMES[name][0]
    name = re.sub(r"\s+s\.l\.$", "", name)
    name = re.sub(r"\s+var\..*$", "", name)
    return name.replace("×", "x")


def pick_record(records: list[dict], name: str) -> dict | None:
    """Il record EASIN della specie: stesso nome (o che inizia così), preferendo quelli di rilevanza unionale."""
    if name in EASIN_NAMES:
        exact = EASIN_NAMES[name][1].lower()
        return next((r for r in records if (r.get("Name") or "").lower() == exact), None)
    target = query_name(name).lower()
    candidates = [r for r in records if (r.get("Name") or "").lower().startswith(target)]
    candidates.sort(key=lambda r: (not r.get("IsEUConcern"), (r.get("Name") or "").lower() != target))
    return candidates[0] if candidates else None


def first_introduction(record: dict) -> dict | None:
    dated = []
    for intro in record.get("FirstIntroductionsInEU") or []:
        year = (intro.get("Year") or "").strip()
        if year.isdigit():
            dated.append((int(year), intro.get("Country")))
    if not dated:
        return None
    year, country = min(dated)
    return {"anno": year, "paese": EU_COUNTRIES.get(country, country)}


def pathways(record: dict) -> list[str]:
    seen: list[str] = []
    for p in record.get("CBD_Pathways") or []:
        category = (p.get("Name") or "").split(":")[0].strip()
        label = PATHWAY_CATEGORIES.get(category)
        if label and label not in seen:
            seen.append(label)
    return seen


def impacts(record: dict) -> list[dict]:
    order = {"alto": 0, "medio": 1, "basso": 2}
    result = {}
    for s in record.get("ImpactOnSectors") or []:
        level = LEVELS.get((s.get("Negative") or "").upper())
        if not level:
            continue
        sector = SECTORS.get(s.get("SectorName"), s.get("SectorName"))
        if sector not in result or order[level] < order[result[sector]]:
            result[sector] = level
    return [{"settore": k, "livello": v} for k, v in sorted(result.items(), key=lambda kv: (order[kv[1]], kv[0]))]


def summarize(record: dict) -> dict:
    countries = sorted({EU_COUNTRIES.get(c.get("Country"), c.get("Country"))
                        for c in record.get("PresentInCountries") or [] if c.get("Country")})
    return {
        "easin_id": record["EASINID"],
        "nome_easin": record.get("Name"),
        "paesi_presenza": countries,
        "prima_introduzione_europa": first_introduction(record),
        "vie_introduzione": pathways(record),
        "impatti": impacts(record),
        "url": FACTSHEET.format(record["EASINID"]),
    }


def main() -> int:
    species = json.loads(REFERENCE.read_text(encoding="utf-8"))["rilevanza_unionale"]
    session = requests.Session()
    session.headers.update(HEADERS)
    result, missing = {}, []
    for name in species:
        try:
            response = session.get(f"{API}/term/{quote(query_name(name))}", timeout=30)
            response.raise_for_status()
            records = response.json()
        except (requests.RequestException, ValueError) as exc:
            print(f"  ! {name}: {exc}")
            missing.append(name)
            continue
        finally:
            time.sleep(REQUEST_DELAY_S)
        record = pick_record(records, name)
        if not record:
            print(f"  ! {name}: non trovata in EASIN")
            missing.append(name)
            continue
        result[slugify(name)] = summarize(record)
        s = result[slugify(name)]
        print(f"  {name}: {s['easin_id']}, {len(s['paesi_presenza'])} paesi, "
              f"{len(s['vie_introduzione'])} vie, {len(s['impatti'])} settori")

    if missing and OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text(encoding="utf-8")).get("specie", {})
        for name in missing:
            if slugify(name) in previous:
                result[slugify(name)] = previous[slugify(name)]

    payload = {
        "fonte": "European Commission - Joint Research Centre - European Alien Species Information Network "
                 "(EASIN), https://easin.jrc.ec.europa.eu/",
        "recuperato_il": date.today().isoformat(),
        "specie": dict(sorted(result.items())),
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(result)}/{len(species)} specie -> {OUTPUT.relative_to(ROOT)}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
