#!/usr/bin/env python3
"""Novità della settimana: confronta i dati appena preparati con quelli pubblicati la volta
precedente su GitHub Pages e registra le segnalazioni nuove.

Legge:   assets/data/species/*.json         punti appena preparati (da build_app_data.py)
         <DATA_BASE_URL>/manifest.json       dati pubblicati l'ultima volta, con le novità
                                             delle settimane precedenti
Scrive:  assets/data/news.json

Formato:
    {"schema": 1, "generato_il": "...",
     "settimane": [                                   # dalla più recente, al massimo MAX_WEEKS
       {"dati_al": "...", "precedenti_al": "...", "nuove": 120,
        "specie": {"<slug>": {"nuove": 30,
                              "regioni": {"9": 12, "0": 1},   # codice ISTAT; "0" = fuori regione
                              "prime_regioni": [9],           # prima segnalazione della specie in regione
                              "prima_in_italia": false}}}]}

"Nuove" sono le segnalazioni comparse su GBIF dall'aggiornamento precedente (anche se
l'avvistamento è di anni prima). Le identificazioni solo automatiche non sono contate: sono
escluse anche dalla mappa con i filtri predefiniti e darebbero false "prime segnalazioni".

I record si riconoscono dall'identificativo GBIF (8° campo dei punti). I dati pubblicati
prima che quel campo esistesse si confrontano per posizione, anno e fonte.

Se i dati precedenti non sono raggiungibili si tengono le novità già note e lo script
termina con codice 1 (il workflow lo segnala come avviso, senza fermarsi).

Uso:  python scripts/build_news.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
SPECIES_DIR = ROOT / "assets" / "data" / "species"
INDEX = ROOT / "data" / "index.json"
OUT = ROOT / "assets" / "data" / "news.json"
DATA_BASE_URL = "https://anghelos98.github.io/ias-tracker/data/v1"
MAX_WEEKS = 12
TIMEOUT = 60


def record_keys(data: dict | None, by_id: bool) -> Counter:
    """Chiavi dei record verificati (non automatici) con la loro regione."""
    keys: Counter = Counter()
    if not data:
        return keys
    for p in data["punti"]:
        if p[4] == 1:
            continue
        region = p[6] if len(p) > 6 and p[6] is not None else 0
        if by_id:
            key = ("id", p[7])
        else:
            key = (p[0], p[1], p[2], data["fonti"][p[3]]["nome"])
        keys[(key, region)] += 1
    return keys


def has_ids(data: dict | None) -> bool:
    return bool(data and data["punti"] and all(len(p) > 7 and p[7] is not None for p in data["punti"]))


def diff_species(previous: dict | None, current: dict | None) -> dict | None:
    """Segnalazioni nuove di una specie, per regione. None se non ce ne sono."""
    by_id = has_ids(current) and (previous is None or not previous["punti"] or has_ids(previous))
    before = record_keys(previous, by_id)
    after = record_keys(current, by_id)
    new = after - before
    if not new:
        return None
    regions: Counter = Counter()
    for (_, region), n in new.items():
        regions[region] += n
    before_regions = Counter()
    for (_, region), n in before.items():
        before_regions[region] += n
    first = sorted(r for r in regions if r != 0 and before_regions[r] == 0)
    return {
        "nuove": sum(regions.values()),
        "regioni": {str(r): n for r, n in sorted(regions.items())},
        "prime_regioni": first,
        "prima_in_italia": sum(before.values()) == 0,
    }


def build_week(previous: dict[str, dict | None], current: dict[str, dict | None],
               previous_date: str, current_date: str) -> dict:
    species = {}
    for slug in sorted(set(previous) | set(current)):
        d = diff_species(previous.get(slug), current.get(slug))
        if d:
            species[slug] = d
    return {
        "dati_al": current_date,
        "precedenti_al": previous_date,
        "nuove": sum(s["nuove"] for s in species.values()),
        "specie": species,
    }


def merge_history(old_weeks: list[dict], week: dict | None) -> list[dict]:
    weeks = [w for w in old_weeks if not week or w["dati_al"] != week["dati_al"]]
    if week:
        weeks.insert(0, week)
    weeks.sort(key=lambda w: w["dati_al"], reverse=True)
    return weeks[:MAX_WEEKS]


def is_real_update(previous_date: str, current_date: str) -> bool:
    """Almeno un giorno tra i due aggiornamenti."""
    delta = datetime.fromisoformat(current_date) - datetime.fromisoformat(previous_date)
    return delta.total_seconds() >= 24 * 3600


def fetch_json(session: requests.Session, url: str):
    r = session.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def load_current() -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in SPECIES_DIR.glob("*.json")}


def write(weeks: list[dict]) -> None:
    OUT.write_text(json.dumps({
        "schema": 1,
        "generato_il": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "settimane": weeks,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> int:
    current_date = json.loads(INDEX.read_text(encoding="utf-8"))["aggiornato_il"]
    local_weeks = json.loads(OUT.read_text(encoding="utf-8"))["settimane"] if OUT.exists() else []

    session = requests.Session()
    session.headers["User-Agent"] = "IAS-Tracker-data-pipeline (https://github.com/Anghelos98/ias-tracker)"
    try:
        manifest = fetch_json(session, f"{DATA_BASE_URL}/manifest.json")
        old_weeks = local_weeks
        if manifest.get("novita"):
            old_weeks = fetch_json(session, f"{DATA_BASE_URL}/{manifest['novita']['file']}")["settimane"]
        previous_date = manifest["dati_gbif_al"]
        if previous_date >= current_date:
            print(f"Nessun dato nuovo rispetto a quelli pubblicati ({previous_date}): novità invariate")
            write(merge_history(old_weeks, None))
            return 0
        previous = {}
        for slug, entry in manifest["specie"].items():
            previous[slug] = fetch_json(session, f"{DATA_BASE_URL}/{entry['punti']['file']}") if entry.get("punti") else None
    except (requests.RequestException, ValueError, KeyError) as exc:
        print(f"Dati pubblicati non raggiungibili ({exc}): tengo le novità già note", file=sys.stderr)
        write(merge_history(local_weeks, None))
        return 1

    week = build_week(previous, load_current(), previous_date, current_date)
    if not week["nuove"] and not is_real_update(previous_date, current_date):
        # dati rigenerati a poche ore di distanza senza nulla di nuovo: non è un aggiornamento
        print(f"Nessuna novità rispetto ai dati di poche ore fa ({previous_date}): novità invariate")
        write(merge_history(old_weeks, None))
        return 0
    write(merge_history(old_weeks, week))
    firsts = sum(len(s["prime_regioni"]) for s in week["specie"].values())
    print(f"Novità dal {previous_date[:10]} al {current_date[:10]}: {week['nuove']} segnalazioni nuove "
          f"di {len(week['specie'])} specie, {firsts} prime segnalazioni in una regione -> "
          f"{OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
