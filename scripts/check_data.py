#!/usr/bin/env python3
"""Controllo di plausibilità prima della pubblicazione dei dati.

Confronta le segnalazioni appena scaricate con quelle pubblicate la volta precedente su GitHub
Pages. Se GBIF ha restituito molti meno dati del solito (errore temporaneo, risposta parziale,
cambio dell'API) lo script termina con codice 1 e il workflow non pubblica: le app continuano
a usare i dati della settimana prima invece di perdere segnalazioni.

Vale anche al contrario: un aumento improvviso e molto grande (per esempio un dataset con migliaia
di segnalazioni inventate pubblicato su GBIF) ferma la pubblicazione, perché qualcuno lo controlli
prima che arrivi a tutte le app.

Un cambiamento reale (un dataset ritirato o uno nuovo molto grande) si pubblica avviando il
workflow a mano con l'opzione "forza" (o `--forza` da riga di comando).

Legge:  data/index.json                      dati appena scaricati (da sync_ias_data.py)
        <DATA_BASE_URL>/manifest.json         dati pubblicati l'ultima volta
Uso:    python scripts/check_data.py [--forza]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "data" / "index.json"
DATA_BASE_URL = "https://anghelos98.github.io/ias-tracker/data/v1"
TIMEOUT = 60

# Una specie con almeno MIN_RECORDS segnalazioni non può perderne più di MAX_SPECIES_DROP;
# il totale non può calare più di MAX_TOTAL_DROP. Le specie piccole possono oscillare di più
# (GBIF corregge o rimuove singoli record), ma non sparire del tutto.
MIN_RECORDS = 50
MAX_SPECIES_DROP = 0.30
MAX_TOTAL_DROP = 0.10
# Aumenti: in una settimana GBIF aggiunge di solito pochi punti percentuali. Una specie con almeno
# MIN_RECORDS segnalazioni non può più che triplicare, il totale non può crescere oltre il 50%.
MAX_SPECIES_RISE = 2.0
MAX_TOTAL_RISE = 0.50


def check(previous: dict, index: dict) -> list[str]:
    """Problemi trovati confrontando il manifest pubblicato con l'indice nuovo (vuoto = tutto bene)."""
    problems = []
    current = {s["slug"]: s for s in index.get("specie", [])}
    for slug, entry in sorted(previous.get("specie", {}).items()):
        before = entry.get("totale") or 0
        if not before:
            continue
        now = current.get(slug, {}).get("totale") or 0
        if slug not in current:
            problems.append(f"{slug}: specie assente dai dati nuovi (prima {before} segnalazioni)")
        elif now == 0:
            problems.append(f"{slug}: 0 segnalazioni (prima {before})")
        elif before >= MIN_RECORDS and now < before * (1 - MAX_SPECIES_DROP):
            problems.append(f"{slug}: {now} segnalazioni (prima {before}, -{1 - now / before:.0%})")
        elif before >= MIN_RECORDS and now > before * (1 + MAX_SPECIES_RISE):
            problems.append(f"{slug}: {now} segnalazioni (prima {before}, +{now / before - 1:.0%}): aumento anomalo")
    before_total = previous.get("totale_segnalazioni") or 0
    now_total = index.get("totale_segnalazioni") or 0
    if before_total and now_total < before_total * (1 - MAX_TOTAL_DROP):
        problems.append(f"totale: {now_total} segnalazioni (prima {before_total}, -{1 - now_total / before_total:.0%})")
    elif before_total and now_total > before_total * (1 + MAX_TOTAL_RISE):
        problems.append(f"totale: {now_total} segnalazioni (prima {before_total}, "
                        f"+{now_total / before_total - 1:.0%}): aumento anomalo")
    return problems


def main(argv: list[str]) -> int:
    force = "--forza" in argv
    index = json.loads(INDEX.read_text(encoding="utf-8"))
    try:
        response = requests.get(f"{DATA_BASE_URL}/manifest.json", timeout=TIMEOUT)
        response.raise_for_status()
        previous = response.json()
    except (requests.RequestException, ValueError) as exc:
        # primo avvio o sito non raggiungibile: niente da confrontare
        print(f"::warning::Dati pubblicati non raggiungibili ({exc}): controllo di plausibilità saltato")
        return 0

    problems = check(previous, index)
    if not problems:
        print(f"Dati plausibili: {index.get('totale_segnalazioni')} segnalazioni "
              f"(prima {previous.get('totale_segnalazioni')})")
        return 0
    for p in problems:
        print(f"::{'warning' if force else 'error'}::{p}")
    if force:
        print("Calo accettato con --forza: i dati vengono pubblicati")
        return 0
    print("Pubblicazione fermata: i dati nuovi sono molto diversi da quelli pubblicati. Se il cambiamento è "
          "reale, avvia il workflow a mano con l'opzione \"forza\".")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
