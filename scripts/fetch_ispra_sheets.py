#!/usr/bin/env python3
"""Scarica le schede delle specie di rilevanza unionale dal sito ISPRA.

Fonte: https://www.specieinvasive.isprambiente.it — i testi sono pubblicati con licenza
Creative Commons Attribuzione 4.0 (CC BY 4.0) ISPRA: si possono riusare citando la fonte
e l'indirizzo della pagina originale. Le foto del sito hanno licenze diverse (spesso
CC BY-SA 3.0, autori di Wikimedia Commons) e NON vengono scaricate.

Legge:   ias_reference.json (elenco delle specie)
Scrive:  assets/data/sheets/<slug>.json   una scheda per specie

Uso:  .venv/bin/python scripts/fetch_ispra_sheets.py
Richiede: requests, beautifulsoup4
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path

import requests
from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "ias_reference.json"
OUT_DIR = ROOT / "assets" / "data" / "sheets"

BASE = "https://www.specieinvasive.isprambiente.it"
LIST_URL = f"{BASE}/specie-di-rilevanza-unionale/specie-di-rilevanza-unionale-2"
LICENSE = "CC BY 4.0"
ATTRIBUTION = "ISPRA – specieinvasive.isprambiente.it"
REQUEST_DELAY_S = 1.0
HEADERS = {"User-Agent": "IAS-Tracker/1.0 (app open source; scarica le schede una tantum)"}


def slugify(name: str) -> str:
    """Stessa regola di sync_ias_data.py: 'Reynoutria × bohemica' -> 'reynoutria-x-bohemica'."""
    name = name.replace("×", "x")
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def name_key(name: str) -> str:
    """Chiave di confronto tra i nomi dell'elenco UE e quelli di ISPRA.

    'Pontederia (Eichhornia) crassipes' -> 'pontederia crassipes'
    'Pueraria montana var. lobata'      -> 'pueraria montana'
    'Hakea sericea s.l.'                -> 'hakea sericea'
    'Reynoutria × bohemica'             -> 'reynoutria x bohemica'
    """
    name = re.sub(r"\([^)]*\)", " ", name)
    name = name.replace("×", "x")
    name = re.sub(r"\b(s\.l\.|var\..*)$", "", name.strip())
    words = name.lower().split()
    return " ".join(words[:3] if len(words) > 2 and words[1] == "x" else words[:2])


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def sentence_case(text: str) -> str:
    """'DISTRIBUZIONE IN ITALIA' / 'in europa' -> 'Distribuzione in Italia' / 'In Europa'."""
    text = clean(text).lower()
    text = re.sub(r"\b(italia|europa)\b", lambda m: m.group(1).capitalize(), text)
    return text[:1].upper() + text[1:]


def get(session: requests.Session, url: str) -> BeautifulSoup:
    response = session.get(url, timeout=30)
    response.raise_for_status()
    time.sleep(REQUEST_DELAY_S)
    return BeautifulSoup(response.text, "html.parser")


# --------------------------------------------------------------------------- elenco

def parse_list(soup: BeautifulSoup) -> dict[str, dict]:
    """Righe dell'elenco ISPRA: chiave nome -> url, nome comune, presenza in Italia."""
    rows = {}
    for tr in soup.select("tr.el-item"):
        link = tr.find("a", href=True)
        title = tr.select_one(".el-title")
        meta = tr.select_one(".el-meta")
        if not link:
            continue
        scientific = clean(link.get_text())
        rows[name_key(scientific)] = {
            "nome_ispra": scientific,
            "url": BASE + link["href"] if link["href"].startswith("/") else link["href"],
            "nome_comune": clean(title.get_text()) if title else None,
            "presenza_italia": clean(meta.get_text()) if meta else None,
        }
    return rows


# --------------------------------------------------------------------------- scheda

def paragraphs(container: Tag, include_lists: bool = True) -> list[dict]:
    """Blocchi di testo di una sezione: paragrafi ed elenchi, con eventuali sottotitoli.

    I sottotitoli (h5/h6) compaiono in due forme: come elemento a sé prima del paragrafo
    (pagine recenti) oppure dentro il paragrafo, <p><h6>nel mondo</h6>testo</p> (pagine
    più vecchie).
    """
    blocks: list[dict] = []
    subtitle = None
    tags = ["h5", "h6", "p", "li"] if include_lists else ["h5", "h6", "p"]
    for el in container.find_all(tags):
        if el.name in ("h5", "h6"):
            if el.find_parent("p") or el.find_parent("li"):
                continue  # gestito insieme al suo paragrafo
            subtitle = sentence_case(el.get_text())
            continue
        if el.find_parent("li") and el.name == "p":
            continue  # già incluso nel <li>
        if not include_lists and el.find_parent("li"):
            continue
        inline = el.find(["h5", "h6"])
        if inline:
            subtitle = sentence_case(inline.get_text())
            inline.extract()
        text = clean(el.get_text(" "))
        # testi vuoti o segnaposto ("." nelle schede ISPRA non ancora compilate)
        if not re.search(r"\w", text) or text.startswith(("Autore:", "Mappa di distribuzione")):
            continue
        block = {"testo": ("• " + text) if el.name == "li" else text}
        if subtitle:
            block["sottotitolo"] = subtitle
            subtitle = None
        blocks.append(block)
    return blocks


def parse_sheet(soup: BeautifulSoup) -> dict:
    sheet: dict = {}

    h1 = soup.find("h1")
    sheet["titolo"] = clean(h1.get_text()) if h1 else None
    author_div = h1.find_next("div") if h1 else None
    sheet["nome_scientifico_autore"] = clean(author_div.get_text()) if author_div else None

    # Descrizione: la colonna di testo accanto alla foto principale.
    intro = soup.select_one("div.uk-width-expand\\@m")
    sheet["descrizione"] = [b["testo"] for b in paragraphs(intro, include_lists=False)] if intro else []

    # Tassonomia e nomi (elenco "etichetta: valore").
    tax = {}
    for li in soup.select("li.el-item"):
        label = li.select_one("h3.el-title")
        value = li.select_one("div.el-content")
        if label and value:
            tax[clean(label.get_text()).lower()] = clean(value.get_text(" "))
    sheet["famiglia"] = tax.get("famiglia")
    sheet["sinonimi"] = tax.get("sinonimi principali")
    sheet["nome_inglese"] = tax.get("nome inglese")

    # Sezioni: titolo in un riquadro colorato (h4), testo nelle colonne accanto.
    sections = []
    for h4 in soup.select("div.uk-tile-primary h4"):
        row = h4.find_parent("div", class_="tm-grid-expand")
        if not row:
            continue
        blocks = []
        for col in row.find_all("div", recursive=False):
            if col.select_one("div.uk-tile-primary"):
                continue
            blocks.extend(paragraphs(col))
        if blocks:
            sections.append({"titolo": sentence_case(h4.get_text()), "blocchi": blocks})
    sheet["sezioni"] = sections

    def first_link(fragment: str) -> str | None:
        a = soup.find("a", href=re.compile(re.escape(fragment)))
        return (BASE + a["href"]) if a and a["href"].startswith("/") else (a["href"] if a else None)

    # Scheda completa = descrizione più le sezioni descrittive. Le specie aggiunte di recente
    # hanno su ISPRA solo una pagina segnaposto; alcune pagine vecchie solo la descrizione.
    sheet["completa"] = bool(sheet["descrizione"]) and len(sections) >= 5

    sheet["pdf_scheda"] = first_link("/images/schede-specie/")
    sheet["pdf_valutazione_rischio"] = first_link("/images/schede-risk-assessment/")
    sheet["mappa_distribuzione"] = first_link("/images/distribuzione-specie/immagini/")
    sheet["shapefile_distribuzione"] = first_link("/images/distribuzione-specie/shapefile/")
    return sheet


# --------------------------------------------------------------------------- main

def main() -> int:
    species = json.loads(REFERENCE.read_text(encoding="utf-8"))["rilevanza_unionale"]
    session = requests.Session()
    session.headers.update(HEADERS)

    print(f"Elenco ISPRA: {LIST_URL}")
    rows = parse_list(get(session, LIST_URL))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    missing, written = [], 0
    for name in species:
        row = rows.get(name_key(name))
        if not row:
            missing.append(name)
            print(f"  ! {name}: non trovata nell'elenco ISPRA")
            continue
        try:
            sheet = parse_sheet(get(session, row["url"]))
        except requests.RequestException as exc:
            missing.append(name)
            print(f"  ! {name}: errore nel download ({exc})")
            continue
        sheet.update({
            "nome_scientifico": name,
            "nome_comune_ispra": row["nome_comune"],
            "presenza_italia": row["presenza_italia"],
            "fonte": {
                "attribuzione": ATTRIBUTION,
                "licenza": LICENSE,
                "url": row["url"],
                "recuperato_il": date.today().isoformat(),
            },
        })
        path = OUT_DIR / f"{slugify(name)}.json"
        path.write_text(json.dumps(sheet, ensure_ascii=False, indent=1), encoding="utf-8")
        written += 1
        n_text = sum(len(b["testo"]) for s in sheet["sezioni"] for b in s["blocchi"])
        flag = "" if sheet["completa"] else "   <- INCOMPLETA su ISPRA"
        print(f"  {name}: {len(sheet['descrizione'])} par. descrizione, "
              f"{len(sheet['sezioni'])} sezioni, {n_text} caratteri{flag}")

    print(f"\n{written}/{len(species)} schede salvate in {OUT_DIR.relative_to(ROOT)}")
    if missing:
        print("Mancanti:", ", ".join(missing))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
