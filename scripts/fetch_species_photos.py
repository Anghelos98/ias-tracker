#!/usr/bin/env python3
"""Raccoglie da iNaturalist alcune foto per ogni specie, solo con licenza CC0 o CC BY.

Per ogni specie: prima le foto rappresentative del taxon su iNaturalist, poi (se non bastano)
foto di osservazioni verificate ("research grade"). Si salvano solo i collegamenti alle foto
con autore, licenza e pagina di origine: le immagini restano su iNaturalist.

Legge:   ias_reference.json
Scrive:  assets/data/photos.json   {specie: {slug: [{url, url_grande, autore, licenza, pagina}, ...]}}

Uso:  .venv/bin/python scripts/fetch_species_photos.py
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

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "ias_reference.json"
OUTPUT = ROOT / "assets" / "data" / "photos.json"

API = "https://api.inaturalist.org/v1"
HEADERS = {"User-Agent": "AlienHub/1.0 (https://github.com/Anghelos98/ias-tracker)"}
REQUEST_DELAY_S = 1.0  # iNaturalist chiede al massimo ~1 richiesta al secondo
PHOTOS_PER_SPECIES = 4
ALLOWED_LICENSES = {"cc0": "CC0", "cc-by": "CC BY"}


def slugify(name: str) -> str:
    """Stessa regola di sync_ias_data.py."""
    name = name.replace("×", "x")
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def inat_name(name: str) -> str:
    """Nome come lo scrive iNaturalist: senza 's.l.', 'var.' e con '×' per gli ibridi."""
    name = re.sub(r"\s+s\.l\.$", "", name)
    name = name.replace(" var. ", " ")
    return name.replace(" x ", " × ")


def get(session: requests.Session, path: str, params: dict | None = None) -> dict:
    response = session.get(f"{API}{path}", params=params, timeout=30)
    response.raise_for_status()
    time.sleep(REQUEST_DELAY_S)
    return response.json()


def find_taxon(session: requests.Session, name: str) -> dict | None:
    """Taxon iNaturalist con lo stesso nome, oppure quello di cui il nome è un sinonimo
    (iNaturalist usa a volte nomi più recenti: es. Prosopis juliflora -> Neltuma juliflora)."""
    target = inat_name(name).lower()
    results = get(session, "/taxa", {"q": inat_name(name), "per_page": 10}).get("results", [])
    for taxon in results:
        if taxon.get("name", "").lower() == target:
            return taxon
    for taxon in results:
        if (taxon.get("matched_term") or "").lower() == target:
            return taxon
    return None


def photo_entry(photo: dict) -> dict | None:
    license_ = ALLOWED_LICENSES.get(photo.get("license_code") or "")
    if not license_ or not photo.get("url"):
        return None
    square = photo["url"]
    # attribuzione iNaturalist: "(c) Nome, some rights reserved (CC BY)" -> "Nome"
    author = re.sub(r"^\(c\)\s*", "", photo.get("attribution") or "")
    author = re.split(r",\s*(some|no) rights reserved", author)[0].strip() or "autore sconosciuto"
    return {
        "url": square.replace("/square.", "/medium."),
        "url_grande": square.replace("/square.", "/large."),
        "autore": author,
        "licenza": license_,
        "pagina": f"https://www.inaturalist.org/photos/{photo['id']}",
    }


def photos_for(session: requests.Session, name: str) -> tuple[list[dict], str | None]:
    """Foto della specie e nome usato da iNaturalist (se diverso da quello dell'elenco UE)."""
    taxon = find_taxon(session, name)
    if not taxon:
        return [], None
    photos: list[dict] = []
    seen: set[str] = set()

    def add(photo: dict) -> None:
        entry = photo_entry(photo)
        if entry and entry["pagina"] not in seen and len(photos) < PHOTOS_PER_SPECIES:
            seen.add(entry["pagina"])
            photos.append(entry)

    detail = get(session, f"/taxa/{taxon['id']}").get("results", [{}])[0]
    for tp in detail.get("taxon_photos", []):
        add(tp.get("photo", {}))

    if len(photos) < PHOTOS_PER_SPECIES:
        observations = get(session, "/observations", {
            "taxon_id": taxon["id"],
            "quality_grade": "research",
            "photo_license": ",".join(ALLOWED_LICENSES),
            "order_by": "votes",
            "per_page": 20,
        })
        for obs in observations.get("results", []):
            for photo in obs.get("photos", []):
                add(photo)
                break  # una foto per osservazione, per varietà
    inat = taxon.get("name")
    return photos, (inat if inat and inat.lower() != inat_name(name).lower() else None)


def load_previous() -> dict[str, list[dict]]:
    """Foto salvate dall'esecuzione precedente, per specie."""
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8")).get("specie", {})
    except (OSError, ValueError, AttributeError):
        return {}


def main() -> int:
    species = json.loads(REFERENCE.read_text(encoding="utf-8"))["rilevanza_unionale"]
    session = requests.Session()
    session.headers.update(HEADERS)
    result: dict[str, list[dict]] = {}
    inat_names: dict[str, str] = {}
    failed = []
    for name in species:
        try:
            photos, inat = photos_for(session, name)
        except requests.RequestException as exc:
            print(f"  ! {name}: {exc}")
            failed.append(name)
            continue
        result[slugify(name)] = photos
        if inat:
            inat_names[slugify(name)] = inat
        print(f"  {name}: {len(photos)} foto" + (f" (su iNaturalist: {inat})" if inat else ""))

    previous = load_previous()
    # mantiene le foto già raccolte per le specie non riuscite
    for name in failed:
        result.setdefault(slugify(name), previous.get(slugify(name), []))
    # nessuna foto trovata dove prima c'erano: probabile cambio dell'API, si tengono le precedenti
    for slug, photos in result.items():
        if not photos and previous.get(slug):
            print(f"  ! {slug}: nessuna foto trovata, tengo le {len(previous[slug])} precedenti")
            result[slug] = previous[slug]

    payload = {
        "fonte": "iNaturalist (inaturalist.org), solo foto con licenza CC0 o CC BY",
        "recuperato_il": date.today().isoformat(),
        "nomi_inaturalist": inat_names,
        "specie": result,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    with_photos = sum(1 for p in result.values() if p)
    print(f"\n{with_photos}/{len(species)} specie con foto -> {OUTPUT.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
