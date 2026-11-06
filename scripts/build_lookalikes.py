#!/usr/bin/env python3
"""Specie simili: con cosa si può confondere ogni specie, citando le schede ISPRA.

Le voci sono scelte a mano tra le frasi delle schede ISPRA che descrivono una possibile
confusione. Per ogni voce sono indicati solo l'inizio e la fine della frase: il testo viene
estratto dalla scheda scaricata, quindi la citazione è sempre letterale. Se ISPRA cambia la
frase, lo script lo segnala e la voce viene omessa (niente testo inventato).

"correlate" collega le specie dell'elenco UE che si confondono tra loro, nei due sensi.

Legge:   assets/data/sheets/<slug>.json   (da fetch_ispra_sheets.py, testi ISPRA CC BY 4.0)
Scrive:  assets/data/lookalikes.json

Uso:  python scripts/build_lookalikes.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHEETS_DIR = ROOT / "assets" / "data" / "sheets"
OUTPUT = ROOT / "assets" / "data" / "lookalikes.json"

# slug: [(specie con cui si confonde, inizio della citazione, fine della citazione)]
CURATED: dict[str, list[tuple[list[str], str, str]]] = {
    "acacia-mearnsii": [
        (["Acacia dealbata (mimosa)"], "questa specie è facilmente confondibile con A. dealbata", "A. dealbata"),
    ],
    "asclepias-syriaca": [
        (["Asclepias speciosa"], "Può essere confusa con Asclepias speciosa", "meno numerosi."),
    ],
    "cabomba-caroliniana": [
        (["Cabomba furcata", "Ceratophyllum", "Myriophyllum"],
         "Può essere confusa con altre specie aquatiche", "Myriophyllum"),
    ],
    "cortaderia-jubata": [
        (["Cortaderia selloana (erba della pampa)"], "Salvo l'utilizzo di tecniche di DNA barcoding", "entrambe."),
        (["Cortaderia selloana (erba della pampa)"], "Gli elementi che maggiormente contribuiscono", "pannocchia)."),
    ],
    "delairea-odorata": [
        (["Senecio angulatus"], "Questa specie è facilmente confondibile con altre congeneri", "Senecio angulatus )"),
    ],
    "gunnera-tinctoria": [
        (["Gunnera manicata", "rabarbaro (Rheum rhabarbarum)"], "E’ molto simile alla congenere", "privo di spine."),
    ],
    "heracleum-persicum": [
        (["Heracleum mantegazzianum", "Heracleum sosnowskyi"], "Si distingue dalle altre specie simili",
         "odore di anice."),
    ],
    "heracleum-sosnowskyi": [
        (["Heracleum mantegazzianum", "Heracleum persicum"], "E’ simile a H. mantegazzianum",
         "compresa” in H. mantegazzianum"),
    ],
    "ludwigia-grandiflora": [
        (["Ludwigia peploides"], "La specie è facilmente confondibile con L. peploides", "fioritura."),
    ],
    "ludwigia-peploides": [
        (["Ludwigia grandiflora"], "facilmente confondibile con Ludwigia grandiflora", "fioritura."),
    ],
    "lysichiton-americanus": [
        (["Arum maculatum (gigaro)"], "Può essere confusa con Arum maculatum", "habitat simili."),
    ],
    "myriophyllum-heterophyllum": [
        (["Myriophyllum spicatum", "Myriophyllum verticillatum"], "Può essere confusa con altre specie di Myriophyllum",
         "M. verticillatum L.)"),
    ],
    "parthenium-hysterophorus": [
        (["Ambrosia", "Artemisia"], "La lobatura delle foglie", "sviluppo."),
    ],
    "prosopis-juliflora": [
        (["Prosopis chilensis", "Prosopis glandulosa", "Prosopis pallida"], "I caratteri di P. juliflora possono",
         "Kunth."),
    ],
    "reynoutria-x-bohemica": [
        (["Reynoutria japonica", "Reynoutria sachalinensis"], "In quanto ibrido, è stato spesso confuso",
         "con le specie parentali"),
    ],
    "rugulopteryx-okamurae": [
        (["Dictyota", "Taonia atomaria"], "Può essere confusa con alghe native", "Taonia atomaria )."),
        (["posidonia (Posidonia oceanica)"], "Le biomasse spiaggiate possono essere confuse", "oceanica )."),
    ],
    "salvinia-molesta": [
        (["Salvinia natans"], "I peli della pagina superiore formano", "S. natans ."),
    ],
}

# Gruppi di specie dell'elenco UE che si confondono tra loro (collegamento nei due sensi).
RELATED_GROUPS = [
    ["heracleum-mantegazzianum", "heracleum-persicum", "heracleum-sosnowskyi"],
    ["ludwigia-grandiflora", "ludwigia-peploides"],
    ["reynoutria-japonica", "reynoutria-sachalinensis", "reynoutria-x-bohemica"],
]


def sheet_texts(sheet: dict) -> list[str]:
    return list(sheet.get("descrizione", [])) + [b["testo"] for s in sheet.get("sezioni", []) for b in s["blocchi"]]


def extract(texts: list[str], start: str, end: str) -> str | None:
    """Testo letterale da `start` fino a `end` incluso, nello stesso blocco di testo."""
    for text in texts:
        i = text.find(start)
        if i < 0:
            continue
        j = text.find(end, i)
        if j < 0:
            continue
        quote = text[i: j + len(end)].strip()
        if quote[0].islower():
            quote = "…" + quote
        return quote
    return None


def main() -> int:
    result: dict[str, dict] = {}
    missing = []
    for slug, entries in CURATED.items():
        path = SHEETS_DIR / f"{slug}.json"
        sheet = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        texts = sheet_texts(sheet)
        voices = []
        for names, start, end in entries:
            quote = extract(texts, start, end)
            if quote is None:
                missing.append(f"{slug}: «{start}…{end}»")
                continue
            voices.append({"simili": names, "citazione": quote, "url": sheet.get("fonte", {}).get("url")})
        if voices:
            result.setdefault(slug, {})["voci"] = voices

    for group in RELATED_GROUPS:
        for slug in group:
            result.setdefault(slug, {})["correlate"] = [s for s in group if s != slug]

    payload = {
        "fonte": "Citazioni dalle schede ISPRA (specieinvasive.isprambiente.it), licenza CC BY 4.0",
        "specie": dict(sorted(result.items())),
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    n_voices = sum(len(v.get("voci", [])) for v in result.values())
    print(f"{n_voices} citazioni per {sum(1 for v in result.values() if v.get('voci'))} specie, "
          f"{len(result)} specie con informazioni -> {OUTPUT.relative_to(ROOT)}")
    if missing:
        print("Frasi non più trovate nelle schede ISPRA (voci omesse):")
        for m in missing:
            print("  -", m)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
