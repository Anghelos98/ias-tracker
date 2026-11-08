"""Difese comuni degli script che scaricano dati da siti esterni.

Questi script girano anche nel workflow "Aggiorna dati", che pubblica il sito da cui tutte le app
scaricano i dati: quello che arriva da un sito di terzi (una pagina ISPRA modificata, un file
enorme, uno zip costruito apposta) non deve poter portare l'app su altri siti, né bloccare o
riempire il server che esegue il workflow.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests

ISPRA_BASE = "https://www.specieinvasive.isprambiente.it"
ISPRA_HOSTS = {"www.specieinvasive.isprambiente.it", "specieinvasive.isprambiente.it"}


def ispra_url(href: object) -> str | None:
    """Indirizzo assoluto https di una pagina o di un file del sito ISPRA, oppure None.

    I link letti dalle pagine ISPRA finiscono nell'app ("Scheda completa (PDF)") e lo shapefile
    della griglia viene scaricato dal workflow: un link verso un altro sito viene scartato, anche
    se contiene il percorso atteso ("https://altro.sito/images/schede-specie/…"). I link http
    del sito ISPRA diventano https.
    """
    if not isinstance(href, str) or not href.strip():
        return None
    url = urljoin(ISPRA_BASE + "/", href.strip())
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or parts.hostname not in ISPRA_HOSTS:
        return None
    if parts.username or parts.password or port not in (None, 80, 443):
        return None
    return parts._replace(scheme="https", netloc=parts.hostname).geturl()


def get_limited(session: requests.Session, url: str, max_bytes: int, timeout: float = 60,
                final_url_ok=None) -> requests.Response:
    """GET con dimensione massima della risposta (il contenuto è in `response.content`).

    Se il sito dichiara una dimensione maggiore il file non viene scaricato; altrimenti lo
    scaricamento si interrompe appena la supera. `final_url_ok` controlla l'indirizzo finale
    dopo eventuali reindirizzamenti (per esempio verso un altro sito).
    """
    response = session.get(url, timeout=timeout, stream=True)
    try:
        response.raise_for_status()
        if final_url_ok is not None and not final_url_ok(response.url):
            raise ValueError(f"reindirizzato fuori dal sito atteso: {response.url}")
        declared = response.headers.get("Content-Length", "")
        if declared.isdigit() and int(declared) > max_bytes:
            raise ValueError(f"file troppo grande ({declared} byte)")
        body = bytearray()
        for chunk in response.iter_content(64 * 1024):
            body.extend(chunk)
            if len(body) > max_bytes:
                raise ValueError(f"file troppo grande (oltre {max_bytes} byte)")
        response._content = bytes(body)  # come se fosse stato scaricato senza stream
        return response
    finally:
        response.close()


def extract_zip_limited(data: bytes, dest: str | Path, max_files: int, max_total_bytes: int) -> None:
    """Estrae uno zip scaricato con un limite al numero di file e allo spazio occupato.

    Un archivio da pochi KB può decomprimersi in decine di GB ("zip bomb"). Python estrae ogni
    file fino alla dimensione dichiarata nell'archivio, quindi basta controllare le dimensioni
    dichiarate. I percorsi con ".." o assoluti sono già neutralizzati da zipfile.
    """
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > max_files:
            raise ValueError(f"archivio con troppi file ({len(entries)})")
        total = sum(e.file_size for e in entries)
        if total > max_total_bytes:
            raise ValueError(f"archivio troppo grande una volta estratto ({total} byte)")
        archive.extractall(dest)
