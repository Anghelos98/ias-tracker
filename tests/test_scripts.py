"""Test degli script Python della pipeline dati (nessuna richiesta di rete)."""

import json

from bs4 import BeautifulSoup

import build_app_data
import build_lookalikes
import build_site
import fetch_easin as easin
import fetch_ispra_grids as grids
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
    easin_file = tmp_path / "easin.json"
    easin_file.write_text('{"specie": {}}')
    monkeypatch.setattr(build_site, "EASIN", easin_file)

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
    assert manifest["europa"]["file"] == "easin.json"
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


# --------------------------------------------------------------------------- EASIN

def test_easin_nomi_e_record():
    assert easin.query_name("Hakea sericea s.l.") == "Hakea sericea"
    assert easin.query_name("Pueraria montana var. lobata") == "Pueraria montana"
    assert easin.query_name("Reynoutria × bohemica") == "Reynoutria x bohemica"
    assert easin.query_name("Prosopis juliflora") == "Neltuma juliflora"
    records = [
        {"Name": "Pueraria montana (Lour.) Merr. var. lobata", "IsEUConcern": True},
        {"Name": "Pueraria montana", "IsEUConcern": False},
        {"Name": "Altro", "IsEUConcern": True},
    ]
    assert easin.pick_record(records, "Pueraria montana var. lobata")["IsEUConcern"] is True
    cortaderia = [{"Name": "Cortaderia selloana", "IsEUConcern": False},
                  {"Name": "Cortaderia selloana subsp. jubata", "IsEUConcern": True}]
    assert easin.pick_record(cortaderia, "Cortaderia jubata")["Name"].endswith("jubata")


def test_easin_riepilogo():
    record = {
        "EASINID": "R1", "Name": "X",
        "PresentInCountries": [{"Country": "IT"}, {"Country": "CH"}, {"Country": "IT"}],
        "FirstIntroductionsInEU": [{"Country": "IT", "Year": "-   "}, {"Country": "FR", "Year": "1900"},
                                   {"Country": "UK", "Year": "1850"}],
        "CBD_Pathways": [{"Name": "ESCAPE FROM CONFINEMENT: Horticulture"},
                         {"Name": "ESCAPE FROM CONFINEMENT: Botanical garden"},
                         {"Name": "RELEASE IN NATURE: Other"}],
        "ImpactOnSectors": [{"SectorName": "Agriculture", "Negative": "LOW"},
                            {"SectorName": "Agriculture", "Negative": "HIGH"},
                            {"SectorName": "Soil", "Negative": "MEDIUM"},
                            {"SectorName": "Forestry", "Negative": None}],
    }
    s = easin.summarize(record)
    assert s["paesi_presenza"] == ["Italia", "Svizzera"]
    assert s["prima_introduzione_europa"] == {"anno": 1850, "paese": "Regno Unito"}
    assert s["vie_introduzione"] == ["Fuga da coltivazioni, giardini, acquari o allevamenti",
                                     "Rilascio intenzionale in natura"]
    assert s["impatti"] == [{"settore": "Agricoltura", "livello": "alto"}, {"settore": "Suolo", "livello": "medio"}]
    assert s["url"].endswith("/R1")


# --------------------------------------------------------------------------- griglia ISPRA

def _shapefile_zip(cells):
    """Zip di uno shapefile con celle 10x10 km (EPSG:3035) e il campo Species."""
    import io
    import zipfile

    import shapefile as pyshp

    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    w = pyshp.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=pyshp.POLYGON)
    w.field("CELLCODE", "C")
    w.field("Species", "C")
    for code, x, y, species in cells:
        w.poly([[(x, y), (x, y + 10000), (x + 10000, y + 10000), (x + 10000, y), (x, y)]])
        w.record(code, species)
    w.close()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("g.shp", shp.getvalue())
        z.writestr("g.shx", shx.getvalue())
        z.writestr("g.dbf", dbf.getvalue())
    return out.getvalue()


def test_griglia_solo_celle_con_la_specie_unite_e_convertite():
    data = _shapefile_zip([
        ("10kmE452N205", 4520000, 2050000, "Planta probatoria"),
        ("10kmE453N205", 4530000, 2050000, "Planta probatoria"),  # adiacente alla prima
        ("10kmE460N210", 4600000, 2100000, ""),                   # cella senza la specie
    ])
    cells, codes = grids.read_cells(data)
    assert codes == {"10kmE452N205", "10kmE453N205"}
    polygons = grids.to_polygons(cells)
    assert len(polygons) == 1 and polygons[0]["buchi"] == []
    lons = [p[0] for p in polygons[0]["esterno"]]
    lats = [p[1] for p in polygons[0]["esterno"]]
    # la griglia LAEA attorno a E4520 N2050 km cade in Italia centrale
    assert 11 < min(lons) < max(lons) < 14 and 41 < min(lats) < max(lats) < 43
    assert grids.to_polygons([]) == []
