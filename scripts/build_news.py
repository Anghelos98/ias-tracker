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
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
SPECIES_DIR = ROOT / "assets" / "data" / "species"
INDEX = ROOT / "data" / "index.json"
OUT = ROOT / "assets" / "data" / "news.json"
DATA_BASE_URL = "https://anghelos98.github.io/ias-tracker/data/v1"
MAX_WEEKS = 12
TIMEOUT = 60
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _region(p: list) -> int:
    return p[6] if len(p) > 6 and p[6] is not None else 0


def _location_key(p: list, data: dict) -> tuple:
    """Posizione, anno e fonte: identificano un record anche senza identificativo GBIF."""
    return (p[0], p[1], p[2], data["fonti"][p[3]]["nome"])


def record_keys(data: dict | None, by_id: bool) -> Counter:
    """Chiavi dei record verificati (non automatici) con la loro regione."""
    keys: Counter = Counter()
    if not data:
        return keys
    for p in data["punti"]:
        if p[4] == 1:
            continue
        key = ("id", p[7]) if by_id else _location_key(p, data)
        keys[(key, _region(p))] += 1
    return keys


def has_ids(data: dict | None) -> bool:
    return bool(data and data["punti"] and all(len(p) > 7 and p[7] is not None for p in data["punti"]))


def new_by_region(previous: dict | None, current: dict | None) -> Counter:
    """Numero di segnalazioni nuove per regione.

    Con gli identificativi GBIF un record è nuovo se il suo identificativo non c'era. GBIF però
    a volte reindicizza un dataset assegnando identificativi nuovi a record già pubblicati:
    per non annunciarli come novità, un record con identificativo nuovo conta solo se anche
    posizione, anno e fonte non erano già presenti (stessa regola usata senza identificativi).
    """
    by_id = has_ids(current) and (previous is None or not previous["punti"] or has_ids(previous))
    new = record_keys(current, by_id) - record_keys(previous, by_id)
    regions: Counter = Counter()
    if not by_id or not previous or not previous["punti"]:
        for (_, region), n in new.items():
            regions[region] += n
        return regions
    new_ids = {key[1] for (key, _region_code) in new}
    surplus = record_keys(current, False) - record_keys(previous, False)  # posizioni in più
    candidates: Counter = Counter()
    for p in current["punti"]:
        if p[4] != 1 and p[7] in new_ids:
            candidates[(_location_key(p, current), _region(p))] += 1
    for key, n in candidates.items():
        kept = min(n, surplus[key])
        if kept:
            regions[key[1]] += kept
    return regions


def diff_species(previous: dict | None, current: dict | None) -> dict | None:
    """Segnalazioni nuove di una specie, per regione. None se non ce ne sono."""
    regions = new_by_region(previous, current)
    if not sum(regions.values()):
        return None
    before_regions: Counter = Counter()
    for (_, region), n in record_keys(previous, False).items():
        before_regions[region] += n
    first = sorted(r for r in regions if r != 0 and before_regions[r] == 0)
    return {
        "nuove": sum(regions.values()),
        "regioni": {str(r): n for r, n in sorted(regions.items())},
        "prime_regioni": first,
        "prima_in_italia": sum(before_regions.values()) == 0,
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


def plausible_date(value: object, now: datetime | None = None) -> bool:
    """Data ISO con l'ora ("AAAA-MM-GGT…"), valida e non nel futuro (tolleranza di due giorni).

    Le date dei dati pubblicati vengono riprese a ogni esecuzione e l'app salva l'ultima come
    "novità già viste": una data come "9999-…" bloccherebbe le novità successive.
    """
    if not isinstance(value, str) or len(value) > 40 or not re.match(r"\d{4}-\d{2}-\d{2}T", value):
        return False
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment <= (now or datetime.now(timezone.utc)) + timedelta(days=2)


def _count(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def valid_week(week: object) -> bool:
    """Settimana delle novità con la forma prodotta da build_week (e attesa dall'app)."""
    if not isinstance(week, dict) or not plausible_date(week.get("dati_al")):
        return False
    if week.get("precedenti_al") is not None and not plausible_date(week["precedenti_al"]):
        return False
    if not _count(week.get("nuove", 0)) or not isinstance(week.get("specie", {}), dict):
        return False
    for slug, s in week.get("specie", {}).items():
        if not SLUG_RE.match(slug) or not isinstance(s, dict) or not _count(s.get("nuove")):
            return False
        regions, firsts = s.get("regioni", {}), s.get("prime_regioni", [])
        if not isinstance(regions, dict) or not all(_count(n) for n in regions.values()):
            return False
        if not isinstance(firsts, list) or not all(_count(r) for r in firsts):
            return False
    return True


def valid_weeks(weeks: object) -> list[dict]:
    """Settimane precedenti prese dal sito pubblicato, solo quelle con la forma attesa.

    Vengono ripubblicate a ogni esecuzione: senza controllo, un file alterato una volta si
    ripresenterebbe per le dodici settimane successive.
    """
    if not isinstance(weeks, list):
        return []
    kept = [w for w in weeks if valid_week(w)]
    if len(kept) < len(weeks):
        print(f"::warning::Novità pubblicate: {len(weeks) - len(kept)} settimane scartate perché non valide")
    return kept


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
            # solo il file atteso, non un percorso qualsiasi indicato dal manifest pubblicato
            if manifest["novita"].get("file") != OUT.name:
                raise ValueError(f"file delle novità inatteso: {manifest['novita'].get('file')!r}")
            old_weeks = valid_weeks(fetch_json(session, f"{DATA_BASE_URL}/{OUT.name}").get("settimane"))
        previous_date = manifest["dati_gbif_al"]
        if not plausible_date(previous_date):
            raise ValueError(f"data dei dati pubblicati non valida: {previous_date!r}")
        if previous_date >= current_date:
            print(f"Nessun dato nuovo rispetto a quelli pubblicati ({previous_date}): novità invariate")
            write(merge_history(old_weeks, None))
            return 0
        previous = {}
        for slug, entry in manifest["specie"].items():
            if not SLUG_RE.match(slug):
                raise ValueError(f"specie con un nome non valido nel manifest: {slug!r}")
            if entry.get("punti") and entry["punti"].get("file") != f"species/{slug}.json":
                raise ValueError(f"percorso inatteso per {slug}: {entry['punti'].get('file')!r}")
            previous[slug] = fetch_json(session, f"{DATA_BASE_URL}/species/{slug}.json") if entry.get("punti") else None
    except (requests.RequestException, ValueError, KeyError, AttributeError, TypeError) as exc:
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
