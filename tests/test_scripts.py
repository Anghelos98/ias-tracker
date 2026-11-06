"""Test degli script Python della pipeline dati (nessuna richiesta di rete)."""

import json

from bs4 import BeautifulSoup

import build_app_data
import build_lookalikes
import build_site
import fetch_ispra_sheets as ispra
import fetch_species_photos as photos
import sync_ias_data as sync

REFERENCE = json.loads((sync.REFERENCE_FILE).read_text(encoding="utf-8"))["rilevanza_unionale"]


# --------------------------------------------------------------------------- nomi e slug

def test_slug_uguale_in_tutti_gli_script():
    for name in REFERENCE:
        assert sync.slugify(name) == ispra.slugify(name)
    assert sync.slugify("Reynoutria × bohemica") == "reynoutria-x-bohemica"
    assert sync.slugify("Pueraria montana var. lobata") == "pueraria-montana-var-lobata"


def test_name_key_abbina_le_varianti_ispra():
    assert ispra.name_key("Pontederia (Eichhornia) crassipes") == ispra.name_key("Pontederia crassipes")
    assert ispra.name_key("Pueraria montana var. lobata") == ispra.name_key("Pueraria montana")
    assert ispra.name_key("Hakea sericea s.l.") == ispra.name_key("Hakea sericea")
    assert ispra.name_key("Reynoutria × bohemica") == ispra.name_key("Reynoutria x bohemica")
    assert ispra.name_key("Cenchrus setaceus (Pennisetum setaceum)") == "cenchrus setaceus"


def test_sentence_case():
    assert ispra.sentence_case("DISTRIBUZIONE IN ITALIA") == "Distribuzione in Italia"
    assert ispra.sentence_case("in europa") == "In Europa"


def test_ogni_specie_ha_nome_comune_e_regolamento():
    for name in REFERENCE:
        assert name in build_app_data.COMMON_NAMES
        assert name in build_app_data.SPECIES_LISTING
    listed = [n for names in build_app_data.LISTING.values() for n in names]
    assert sorted(listed) == sorted(REFERENCE)


# --------------------------------------------------------------------------- GBIF

def test_license_label():
    assert sync.license_label("http://creativecommons.org/licenses/by-nc/4.0/legalcode") == "CC BY-NC 4.0"
    assert sync.license_label("http://creativecommons.org/licenses/by/4.0/legalcode") == "CC BY 4.0"
    assert sync.license_label("http://creativecommons.org/publicdomain/zero/1.0/legalcode") == "CC0 1.0"
    assert sync.license_label(None) is None


class FakeClient:
    def dataset_title(self, key):
        return f"Dataset {key}"


def test_clean_record():
    raw = {
        "key": 1, "decimalLatitude": 41.123456789, "decimalLongitude": 12.5, "year": 2020,
        "datasetKey": "abc", "license": "http://creativecommons.org/licenses/by/4.0/legalcode",
        "issues": ["COORDINATE_ROUNDED"],
    }
    rec = sync.clean_record(raw, FakeClient())
    assert rec["lat"] == 41.123457 and rec["lon"] == 12.5
    assert rec["dataset"] == "Dataset abc" and rec["licenza"] == "CC BY 4.0"
    assert rec["identificazione_automatica"] is False
    assert sync.clean_record({**raw, "decimalLatitude": None}, FakeClient()) is None
    assert sync.clean_record({**raw, "decimalLatitude": 95}, FakeClient()) is None


def test_identificazione_automatica():
    raw = {"key": 2, "decimalLatitude": 41, "decimalLongitude": 12,
           "datasetName": "Pl@ntNet automatically identified occurrences"}
    assert sync.clean_record(raw, FakeClient())["identificazione_automatica"] is True


def test_compact():
    geojson = {"features": [
        {"geometry": {"coordinates": [12.1234567, 41.7654321]},
         "properties": {"anno": 2020, "dataset": "A", "licenza": "CC BY 4.0",
                        "identificazione_automatica": False, "incertezza_m": 12.4}},
        {"geometry": {"coordinates": [12.0, 41.0]},
         "properties": {"anno": None, "dataset": "A", "licenza": "CC BY 4.0",
                        "identificazione_automatica": True, "incertezza_m": None}},
    ]}
    out = build_app_data.compact(geojson)
    assert out["fonti"] == [{"nome": "A", "licenza": "CC BY 4.0"}]
    assert out["punti"] == [[12.12346, 41.76543, 2020, 0, 0, 12], [12.0, 41.0, None, 0, 1, None]]


# --------------------------------------------------------------------------- ISPRA

SHEET_HTML = """
<html><body>
<h1>Pianta di prova</h1><div><p><i>Planta probatoria</i> L.</p></div>
<div class="uk-width-expand@m"><div class="uk-panel"><p>Descrizione della pianta.</p></div>
  <ul><li class="el-item"><h3 class="el-title">famiglia</h3><div class="el-content"><p>Probaceae</p></div></li>
  <li class="el-item"><h3 class="el-title">nome inglese</h3><div class="el-content"><p>Test plant</p></div></li></ul>
</div>
<div class="tm-grid-expand">
  <div><div class="uk-tile-primary"><h4>AREA DI INTRODUZIONE</h4></div></div>
  <div><div class="uk-panel"><p><h6>nel mondo</h6>Ovunque.</p><h6>in europa</h6><p>In molti paesi.</p></div></div>
</div>
<div class="tm-grid-expand">
  <div><div class="uk-tile-primary"><h4>biologia ed ecologia</h4></div></div>
  <div><div class="uk-panel"><p>.</p></div></div>
</div>
<a href="/images/schede-specie/Prova.pdf">PDF</a>
</body></html>
"""


def test_parse_sheet():
    sheet = ispra.parse_sheet(BeautifulSoup(SHEET_HTML, "html.parser"))
    assert sheet["titolo"] == "Pianta di prova"
    assert sheet["descrizione"] == ["Descrizione della pianta."]
    assert sheet["famiglia"] == "Probaceae" and sheet["nome_inglese"] == "Test plant"
    # sottotitoli dentro e fuori dal paragrafo; sezione segnaposto (".") scartata
    assert sheet["sezioni"] == [{"titolo": "Area di introduzione", "blocchi": [
        {"testo": "Ovunque.", "sottotitolo": "Nel mondo"},
        {"testo": "In molti paesi.", "sottotitolo": "In Europa"},
    ]}]
    assert sheet["completa"] is False
    assert sheet["pdf_scheda"].endswith("/images/schede-specie/Prova.pdf")


# --------------------------------------------------------------------------- sito

def test_build_site(tmp_path, monkeypatch):
    species_dir = tmp_path / "species"
    sheets_dir = tmp_path / "sheets"
    species_dir.mkdir()
    sheets_dir.mkdir()
    (species_dir / "a.json").write_text('{"fonti":[],"punti":[]}')
    (sheets_dir / "a.json").write_text('{"titolo":"A"}')
    index = tmp_path / "index.json"
    index.write_text(json.dumps({
        "aggiornato_il": "2026-11-06T10:00:00+00:00", "totale_segnalazioni": 3,
        "specie": [
            {"slug": "a", "totale": 3, "identificazioni_automatiche": 0, "anni": None, "bbox": None},
            {"slug": "b", "totale": 0, "identificazioni_automatiche": 0, "anni": None, "bbox": None},
        ],
    }))
    monkeypatch.setattr(build_site, "INDEX", index)
    monkeypatch.setattr(build_site, "SPECIES_DIR", species_dir)
    monkeypatch.setattr(build_site, "SHEETS_DIR", sheets_dir)
    photos_file = tmp_path / "photos.json"
    photos_file.write_text('{"specie": {}}')
    monkeypatch.setattr(build_site, "PHOTOS", photos_file)
    lookalikes_file = tmp_path / "lookalikes.json"
    lookalikes_file.write_text('{"specie": {}}')
    monkeypatch.setattr(build_site, "LOOKALIKES", lookalikes_file)

    site = tmp_path / "site"
    build_site.main(site)
    manifest = json.loads((site / "data" / "v1" / "manifest.json").read_text())
    assert manifest["schema"] == 1 and manifest["totale_segnalazioni"] == 3
    assert manifest["specie"]["a"]["punti"]["file"] == "species/a.json"
    assert len(manifest["specie"]["a"]["punti"]["sha"]) == 16
    assert manifest["specie"]["b"]["punti"] is None
    assert (site / "data" / "v1" / "species" / "a.json").exists()
    assert manifest["foto"]["file"] == "photos.json"
    assert manifest["simili"]["file"] == "lookalikes.json"
    assert (site / "data" / "v1" / "photos.json").exists()
    assert (site / "index.html").exists() and (site / ".nojekyll").exists()


# --------------------------------------------------------------------------- foto iNaturalist

def test_inat_name():
    assert photos.inat_name("Hakea sericea s.l.") == "Hakea sericea"
    assert photos.inat_name("Pueraria montana var. lobata") == "Pueraria montana lobata"
    assert photos.slugify("Reynoutria × bohemica") == sync.slugify("Reynoutria × bohemica")


def test_photo_entry_solo_licenze_libere():
    base = {"id": 7, "url": "https://x.org/photos/7/square.jpeg",
            "attribution": "(c) Mario Rossi, some rights reserved (CC BY)"}
    entry = photos.photo_entry({**base, "license_code": "cc-by"})
    assert entry == {
        "url": "https://x.org/photos/7/medium.jpeg",
        "url_grande": "https://x.org/photos/7/large.jpeg",
        "autore": "Mario Rossi",
        "licenza": "CC BY",
        "pagina": "https://www.inaturalist.org/photos/7",
    }
    assert photos.photo_entry({**base, "license_code": "cc0",
                               "attribution": "(c) Anna, no rights reserved (CC0)"})["autore"] == "Anna"
    for code in (None, "cc-by-nc", "cc-by-sa", "cc-by-nd"):
        assert photos.photo_entry({**base, "license_code": code}) is None


# --------------------------------------------------------------------------- specie simili

def test_extract_citazione_letterale():
    texts = ["Pianta alta. Può essere confusa con X, più piccola. Altro.", "secondo blocco"]
    assert build_lookalikes.extract(texts, "Può essere confusa", "più piccola.") == \
        "Può essere confusa con X, più piccola."
    assert build_lookalikes.extract(texts, "confusa con X", "X") == "…confusa con X"
    assert build_lookalikes.extract(texts, "inesistente", ".") is None


def test_specie_simili_coerenti():
    slugs = {sync.slugify(n) for n in REFERENCE}
    assert set(build_lookalikes.CURATED) <= slugs
    for group in build_lookalikes.RELATED_GROUPS:
        assert set(group) <= slugs
