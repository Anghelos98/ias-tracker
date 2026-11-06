#!/usr/bin/env python3
"""IAS Tracker - sincronizza da GBIF le segnalazioni in Italia delle specie IAS.

Uso:
    python sync_ias_data.py --all                     # tutte le specie di ias_reference.json
    python sync_ias_data.py "Reynoutria japonica"     # una o più specie
    python sync_ias_data.py --all --fresh             # riscarica tutto da zero

Struttura dei dati (pensata per l'app con mappa):
    data/
      index.json               catalogo: una voce per specie con conteggi, bbox, anni,
                               fonti e percorso del file GeoJSON
      species/<slug>.geojson   FeatureCollection GeoJSON (un Point per segnalazione),
                               caricabile direttamente da Leaflet / MapLibre
      raw/<slug>.jsonl         progressi del download, un record per riga, scritti
                               subito su disco: se lo script si interrompe, rilanciandolo
                               riprende saltando i record già salvati
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

API_BASE = "https://api.gbif.org/v1"
COUNTRY = "IT"
PAGE_SIZE = 300                # massimo consentito da /occurrence/search
MAX_RECORDS_PER_QUERY = 9_000  # oltre ~10.000 di offset GBIF smette di rispondere
LAT_MIN, LAT_MAX = -90.0, 90.0 # tutto il globo: include anche record IT con coordinate anomale
MIN_BAND_WIDTH = 0.01          # gradi: sotto questa ampiezza non si suddivide più
REQUEST_DEADLINE = 60.0        # secondi massimi per completare una risposta
REQUEST_ATTEMPTS = 3

ROOT = Path(__file__).resolve().parent
REFERENCE_FILE = ROOT / "ias_reference.json"
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
SPECIES_DIR = DATA_DIR / "species"
INDEX_FILE = DATA_DIR / "index.json"

log = logging.getLogger("ias_tracker.sync")


# --------------------------------------------------------------------------- GBIF

class GBIFClient:
    """Client minimale per l'API pubblica di GBIF, con retry, scadenza e cache dei dataset."""

    def __init__(self, timeout: tuple[float, float] = (10.0, 30.0)) -> None:
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "IAS-Tracker/1.0 (python-requests)"
        retry = Retry(
            total=5,
            backoff_factor=1.0,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET",),
            backoff_max=30,
            respect_retry_after_header=False,
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self._dataset_titles: dict[str, str | None] = {}

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """GET con scadenza totale: GBIF a volte invia 200 e poi non completa il body."""
        for attempt in range(1, REQUEST_ATTEMPTS + 1):
            start = time.monotonic()
            try:
                with self.session.get(f"{API_BASE}{path}", params=params, timeout=self.timeout, stream=True) as resp:
                    resp.raise_for_status()
                    body = bytearray()
                    for chunk in resp.iter_content(64 * 1024):
                        body.extend(chunk)
                        if time.monotonic() - start > REQUEST_DEADLINE:
                            raise requests.Timeout(f"risposta non completata entro {REQUEST_DEADLINE}s")
                log.debug("GET %s %s -> %d in %.1fs", path, params or "", resp.status_code, time.monotonic() - start)
                return json.loads(body)
            except requests.Timeout as exc:
                if attempt == REQUEST_ATTEMPTS:
                    raise
                log.warning("  timeout su %s (tentativo %d/%d): %s", path, attempt, REQUEST_ATTEMPTS, exc)
        raise AssertionError("unreachable")

    def match_taxon(self, scientific_name: str) -> dict[str, Any]:
        """Risolve un nome nel taxonKey accettato del backbone GBIF (solo match esatti)."""
        query = re.sub(r"\s+s\.l\.$", "", scientific_name)  # "Hakea sericea s.l." -> "Hakea sericea"
        data = self._get("/species/match", {"scientificName": query})
        if data.get("matchType") != "EXACT" or "usageKey" not in data:
            raise LookupError(f"nessun match esatto GBIF per '{scientific_name}' (matchType={data.get('matchType')})")
        return {
            "taxonKey": data.get("acceptedUsageKey") or data["usageKey"],
            "nome_gbif": data.get("scientificName"),
            "stato_gbif": data.get("status"),
            "regno": data.get("kingdom"),
            "famiglia": data.get("family"),
        }

    def _search(self, params: dict[str, Any], offset: int, limit: int) -> dict[str, Any]:
        return self._get("/occurrence/search", {**params, "limit": limit, "offset": offset})

    @staticmethod
    def _base_params(taxon_key: int) -> dict[str, Any]:
        return {"taxonKey": taxon_key, "country": COUNTRY, "hasCoordinate": "true"}

    def count(self, taxon_key: int) -> int:
        return self._search(self._base_params(taxon_key), 0, 0).get("count", 0)

    def iter_occurrences(self, taxon_key: int) -> Iterator[dict[str, Any]]:
        """Itera su tutte le occorrenze con coordinate in Italia per un taxon.

        Le query oltre MAX_RECORDS_PER_QUERY vengono suddivise per fasce di latitudine;
        i record sui bordi delle fasce possono ripetersi e vengono deduplicati per gbifID.
        """
        seen: set[int] = set()
        for record in self._iter_lat_band(self._base_params(taxon_key), LAT_MIN, LAT_MAX):
            if record.get("key") not in seen:
                seen.add(record.get("key"))
                yield record

    def _iter_lat_band(self, base: dict[str, Any], lat_min: float, lat_max: float) -> Iterator[dict[str, Any]]:
        params = {**base, "decimalLatitude": f"{lat_min},{lat_max}"}
        count = self._search(params, 0, 0).get("count", 0)
        if count == 0:
            return
        if count > MAX_RECORDS_PER_QUERY and lat_max - lat_min > MIN_BAND_WIDTH:
            mid = round((lat_min + lat_max) / 2, 6)
            yield from self._iter_lat_band(base, lat_min, mid)
            yield from self._iter_lat_band(base, mid, lat_max)
            return
        log.debug("  fascia lat %.3f-%.3f: %d record", lat_min, lat_max, count)
        offset = 0
        while offset < min(count, MAX_RECORDS_PER_QUERY):
            page = self._search(params, offset, PAGE_SIZE)
            yield from page.get("results", [])
            if page.get("endOfRecords", True):
                return
            offset += PAGE_SIZE
        if count > MAX_RECORDS_PER_QUERY:
            log.warning("  fascia troppo densa, troncata a %d record su %d", MAX_RECORDS_PER_QUERY, count)

    def dataset_title(self, dataset_key: str | None) -> str | None:
        """Titolo del dataset, usato quando il record non riporta datasetName."""
        if not dataset_key:
            return None
        if dataset_key not in self._dataset_titles:
            try:
                self._dataset_titles[dataset_key] = self._get(f"/dataset/{dataset_key}").get("title")
            except requests.RequestException as exc:
                log.warning("  impossibile risolvere il dataset %s: %s", dataset_key, exc)
                self._dataset_titles[dataset_key] = None
        return self._dataset_titles[dataset_key]


# --------------------------------------------------------------------------- record

def slugify(name: str) -> str:
    """'Reynoutria × bohemica' -> 'reynoutria-x-bohemica'."""
    name = name.replace("×", "x")
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def valid_coordinates(lat: Any, lon: Any) -> bool:
    return (
        isinstance(lat, (int, float))
        and isinstance(lon, (int, float))
        and -90 <= lat <= 90
        and -180 <= lon <= 180
    )


def clean_record(raw: dict[str, Any], client: GBIFClient) -> dict[str, Any] | None:
    """Tiene ogni record con coordinate valide; gli issue GBIF vengono riportati, non filtrati."""
    lat, lon = raw.get("decimalLatitude"), raw.get("decimalLongitude")
    if not valid_coordinates(lat, lon):
        return None
    dataset = raw.get("datasetName") or client.dataset_title(raw.get("datasetKey"))
    return {
        "gbifID": raw.get("key"),
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "anno": raw.get("year"),
        "data": raw.get("eventDate"),
        "dataset": dataset,
        "istituzione": raw.get("institutionCode"),
        "nome_registrato": raw.get("scientificName"),
        "incertezza_m": raw.get("coordinateUncertaintyInMeters"),
        "identificazione_automatica": bool(dataset and "automatically identified" in dataset.lower()),
        "problemi_gbif": raw.get("issues", []),
    }


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    """Legge i record salvati; ignora un'eventuale ultima riga troncata da un'interruzione."""
    records: list[dict[str, Any]] = []
    if not path.exists():
        return records
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                log.warning("  riga incompleta ignorata in %s", path.name)
    return records


def write_json_atomic(path: Path, data: Any, *, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        if indent is None:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, fh, ensure_ascii=False, indent=indent)
    tmp.replace(path)


# --------------------------------------------------------------------------- output

def to_geojson(species: str, slug: str, taxon: dict[str, Any], records: list[dict[str, Any]]) -> dict[str, Any]:
    features = [
        {
            "type": "Feature",
            "id": r["gbifID"],
            "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
            "properties": {k: v for k, v in r.items() if k not in ("lat", "lon")},
        }
        for r in sorted(records, key=lambda r: (r["anno"] or 0, r["gbifID"]))
    ]
    return {
        "type": "FeatureCollection",
        "metadata": {"nome_scientifico": species, "slug": slug, **taxon, "totale": len(features)},
        "features": features,
    }


def species_summary(species: str, slug: str, taxon: dict[str, Any], records: list[dict[str, Any]],
                    gbif_count: int | None, error: str | None) -> dict[str, Any]:
    years = [r["anno"] for r in records if r["anno"]]
    lats = [r["lat"] for r in records]
    lons = [r["lon"] for r in records]
    sources = Counter(r["dataset"] or "sconosciuto" for r in records)
    return {
        "nome_scientifico": species,
        "slug": slug,
        **taxon,
        "file": f"species/{slug}.geojson" if records else None,
        "totale": len(records),
        "totale_gbif": gbif_count,
        "completo": error is None and gbif_count is not None and len(records) >= gbif_count,
        "identificazioni_automatiche": sum(r["identificazione_automatica"] for r in records),
        "anni": {"min": min(years), "max": max(years)} if years else None,
        "bbox": [min(lons), min(lats), max(lons), max(lats)] if records else None,
        "fonti": dict(sources.most_common()),
        "errore": error,
    }


# --------------------------------------------------------------------------- sync

def sync_species(species: str, client: GBIFClient, fresh: bool) -> dict[str, Any]:
    slug = slugify(species)
    raw_path = RAW_DIR / f"{slug}.jsonl"
    if fresh:
        raw_path.unlink(missing_ok=True)

    try:
        taxon = client.match_taxon(species)
        gbif_count = client.count(taxon["taxonKey"])
    except (LookupError, requests.RequestException) as exc:
        log.error("%s: saltata (%s)", species, exc)
        return species_summary(species, slug, {}, read_jsonl(raw_path), None, str(exc))

    saved_ids = {r["gbifID"] for r in read_jsonl(raw_path)}
    log.info("%s: %d record su GBIF%s", species, gbif_count,
             f", {len(saved_ids)} già salvati" if saved_ids else "")

    error = None
    new = 0
    if gbif_count > len(saved_ids):
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        with raw_path.open("a", encoding="utf-8") as out:
            try:
                for raw in client.iter_occurrences(taxon["taxonKey"]):
                    if raw.get("key") in saved_ids:
                        continue
                    rec = clean_record(raw, client)
                    if rec is None:
                        continue
                    out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    out.flush()  # ogni record finisce subito su disco
                    saved_ids.add(rec["gbifID"])
                    new += 1
                    if new % 2000 == 0:
                        log.info("  ... %d nuovi record salvati", new)
            except requests.RequestException as exc:
                error = f"download interrotto: {exc}"
                log.error("  %s (i record già salvati restano in %s)", error, raw_path.relative_to(ROOT))

    records = read_jsonl(raw_path)
    geojson_path = SPECIES_DIR / f"{slug}.geojson"
    if records:
        write_json_atomic(geojson_path, to_geojson(species, slug, taxon, records))
    else:
        geojson_path.unlink(missing_ok=True)
    if new:
        log.info("  +%d nuovi, totale %d", new, len(records))
    return species_summary(species, slug, taxon, records, gbif_count, error)


def write_index(entries: list[dict[str, Any]]) -> None:
    """Aggiorna data/index.json, conservando le specie non sincronizzate in questa esecuzione."""
    existing: dict[str, dict[str, Any]] = {}
    if INDEX_FILE.exists():
        existing = {s["slug"]: s for s in json.loads(INDEX_FILE.read_text(encoding="utf-8")).get("specie", [])}
    existing.update({e["slug"]: e for e in entries})
    species = sorted(existing.values(), key=lambda s: s["nome_scientifico"])
    index = {
        "app": "IAS Tracker",
        "descrizione": "Segnalazioni in Italia delle specie vegetali esotiche invasive di rilevanza unionale",
        "fonte": "GBIF.org - Global Biodiversity Information Facility",
        "licenza_nota": "I record GBIF hanno licenze CC0 / CC BY / CC BY-NC a seconda del dataset: citare GBIF.org",
        "paese": COUNTRY,
        "aggiornato_il": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "totale_specie": len(species),
        "specie_con_segnalazioni": sum(1 for s in species if s["totale"]),
        "totale_segnalazioni": sum(s["totale"] for s in species),
        "specie": species,
    }
    write_json_atomic(INDEX_FILE, index, indent=2)


def load_reference_species() -> list[str]:
    with REFERENCE_FILE.open(encoding="utf-8") as fh:
        return json.load(fh)["rilevanza_unionale"]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("species", nargs="*", help="nomi scientifici da sincronizzare")
    parser.add_argument("--all", action="store_true", help="tutte le specie di ias_reference.json")
    parser.add_argument("--fresh", action="store_true", help="cancella i progressi salvati e riscarica")
    parser.add_argument("-v", "--verbose", action="store_true", help="log dettagliato di ogni richiesta HTTP")
    args = parser.parse_args(argv)
    if not args.all and not args.species:
        parser.error("indica almeno una specie oppure --all")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    if args.verbose:
        log.setLevel(logging.DEBUG)

    species_list = load_reference_species() if args.all else args.species
    client = GBIFClient()
    entries = []
    for species in species_list:
        entries.append(sync_species(species, client, args.fresh))
        write_index(entries)  # l'indice è sempre aggiornato, anche se lo script si interrompe

    total = sum(e["totale"] for e in entries)
    failed = [e["nome_scientifico"] for e in entries if e["errore"]]
    log.info("Completato: %d specie, %d segnalazioni -> %s", len(entries), total, DATA_DIR.relative_to(ROOT))
    if failed:
        log.warning("Specie da riprovare (rilancia lo script, riprende da dove si era fermato): %s", ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
