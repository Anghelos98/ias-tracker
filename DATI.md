# Fonti dei dati e licenze

La licenza MIT del progetto riguarda **solo il codice**. I dati hanno licenze proprie.

## Segnalazioni (GBIF)

Le segnalazioni sono scaricate dall'API pubblica di
[GBIF – Global Biodiversity Information Facility](https://www.gbif.org)
(`/occurrence/search`, filtro `country=IT`, solo record con coordinate).

GBIF non è l'autore dei dati: ogni record appartiene a un dataset pubblicato da un ente o
da una piattaforma (per esempio iNaturalist, Pl@ntNet, Wikiplantbase, erbari, banche dati
nazionali), che ne sceglie la licenza:

| Licenza   | Uso consentito                                      |
|-----------|-----------------------------------------------------|
| CC0       | qualsiasi uso, nessun obbligo                       |
| CC BY     | qualsiasi uso, **con attribuzione** della fonte      |
| CC BY-NC  | solo uso **non commerciale**, con attribuzione       |

IAS Tracker è gratuita, senza pubblicità e open source: l'uso è non commerciale.
Chi riusa questi dati in altri progetti deve verificare la licenza di ciascun dataset.

Per citare i dati: *GBIF.org, occurrence search, consultato il <data>*, più i dataset di
origine. Il nome del dataset di ogni segnalazione è riportato nei file dati e nella scheda
dell'app.

Lo script salva la licenza di ogni record (campo `licenza`), e l'app la mostra nella
scheda di ciascuna segnalazione insieme alla fonte. Distribuzione al 6 novembre 2026
(24.095 segnalazioni):

| Licenza       | Segnalazioni | Quota |
|---------------|-------------:|------:|
| CC BY 4.0     | 13.003       | 54%   |
| CC BY-NC 4.0  |  9.928       | 41%   |
| CC0 1.0       |  1.164       |  5%   |

Il conteggio per specie è in `data/index.json` (campo `licenze`) dopo la sincronizzazione.

### Collegamento al dato originale

Per ogni segnalazione sono salvati l'identificativo GBIF (pagina `https://www.gbif.org/occurrence/<id>`)
e, quando il record lo riporta (campi `references` o `occurrenceID`), l'indirizzo del dato nella banca
dati di origine, per esempio l'osservazione su iNaturalist o Pl@ntNet, dove si vedono le foto e si può
contribuire all'identificazione. Nel formato compatto dell'app l'indirizzo è diviso in un prefisso
comune, salvato con la fonte (`link`), e un numero per segnalazione (vedi `scripts/build_app_data.py`).
Gli stessi collegamenti sono nelle esportazioni (colonne `gbif` e `dato_originale`).

### Data dell'osservazione

Dal 7 novembre 2026 ogni punto porta anche la data dell'osservazione (decimo campo del formato
compatto, in giorni dal 1° gennaio 1970), solo se GBIF la riporta completa: circa il 96% delle
segnalazioni. Serve ai filtri "Ultimo mese" (ultimi 30 giorni) e "Ultimo anno" (ultimi 12 mesi),
che escludono le segnalazioni senza data completa; gli altri filtri di periodo usano l'anno.
La data compare nella scheda della segnalazione e nelle esportazioni (colonna `data`).

### Novità della settimana

Ogni lunedì `scripts/build_news.py` confronta i dati appena scaricati con quelli pubblicati la
settimana prima su GitHub Pages e salva in `assets/data/news.json` le segnalazioni comparse su GBIF,
per specie e regione, e le *prime segnalazioni* di una specie in una regione (ultime 12 settimane).
Le identificazioni solo automatiche non sono contate. Una segnalazione "nuova" può riguardare un
avvistamento di anni prima, pubblicato solo ora.
Se GBIF reindicizza un dataset con identificativi nuovi, i record che hanno la stessa posizione,
lo stesso anno e la stessa fonte di uno già pubblicato non contano come nuovi.

### Controlli prima della pubblicazione

Il download da GBIF viene ritentato fino a tre volte (lo script riprende da dove si era fermato).
Poi `scripts/check_data.py` confronta i dati nuovi con quelli pubblicati: se una specie con almeno
50 segnalazioni ne perde più del 30%, se una specie scende a zero o se il totale cala di più del 10%,
la pubblicazione si ferma e le app continuano a usare i dati precedenti. Un calo reale (per esempio un
dataset ritirato) si pubblica avviando a mano il workflow "Aggiorna dati" con l'opzione **forza**.
Gli script di ISPRA, EASIN e iNaturalist non sostituiscono una scheda, una griglia o le foto già
presenti con un risultato vuoto (tipico di un cambio di impaginazione del sito di origine).

## Schede delle specie (ISPRA)

I testi delle schede (descrizione, areale, distribuzione, biologia, vettori, impatti,
gestione) provengono dal sito [specieinvasive.isprambiente.it](https://www.specieinvasive.isprambiente.it)
di ISPRA, pubblicati con licenza **Creative Commons Attribuzione 4.0 (CC BY 4.0)**.
Ogni scheda riporta il link alla pagina originale e la data di consultazione
(`assets/data/sheets/<specie>.json`, campo `fonte`); l'app li mostra nella sezione "Fonti".

Le foto del sito ISPRA hanno licenze diverse (spesso CC BY-SA, autori di Wikimedia Commons)
e **non** sono incluse. La mappa di distribuzione è caricata dal sito ISPRA al momento.

A novembre 2026 sette schede ISPRA sono incomplete (per queste l'app mostra comunque foto e dati EASIN): *Celastrus orbiculatus*, *Crassula helmsii*,
*Hakea sericea* e *Nanozostera japonica* (solo pagina segnaposto) e *Gunnera tinctoria*,
*Microstegium vimineum*, *Myriophyllum heterophyllum* (solo descrizione; scheda completa in PDF).

## Griglia ufficiale ISPRA (10×10 km)

Il livello "Griglia ufficiale ISPRA" mostra le celle 10×10 km della griglia europea
(ETRS89-LAEA, EPSG:3035) in cui ISPRA registra la specie, dalla rendicontazione UE di
giugno 2025 (art. 24 Reg. UE 1143/2014). `scripts/fetch_ispra_grids.py` scarica gli shapefile
pubblicati da ISPRA (CC BY 4.0), tiene solo le celle con la specie, le unisce in aree e le
converte in coordinate geografiche (`assets/data/grid/`). ISPRA pubblica la griglia per 22
specie: non per quelle assenti in Italia né per le specie aggiunte all'elenco nel 2025.

## Regioni (ISTAT)

La regione di ogni segnalazione (rapporto per regione e colonna `regione` delle esportazioni) è
calcolata con i *Confini delle unità amministrative a fini statistici* di
[ISTAT](https://www.istat.it/notizia/confini-delle-unita-amministrative-a-fini-statistici-al-1-gennaio-2018-2/)
al 1° gennaio 2026, versione generalizzata, licenza **CC BY 4.0**
([note legali ISTAT](https://www.istat.it/note-legali/)). Modifiche: geometrie semplificate (circa
50 m) e convertite in WGS84 (`scripts/fetch_istat_regions.py` → `scripts/data/regioni.json`).

Le segnalazioni appena fuori dalla costa (entro 3 km) sono assegnate alla regione più vicina; quelle
in mare aperto o oltre confine restano senza regione (16 su 24.095 a novembre 2026).

Per proporre l'ufficio regionale a cui inviare una segnalazione, l'app individua la regione della
posizione con una versione più semplificata degli stessi confini (circa 500 m, solo gli anelli esterni:
`scripts/build_region_shapes.py` → `assets/data/region_shapes.json`).

## A chi segnalare (uffici regionali)

Gli indirizzi degli uffici regionali responsabili per le specie esotiche invasive (`src/data/contacts.js`)
sono presi dalla nota del Ministero dell'Ambiente prot. 0149728 del 9 agosto 2024,
[pubblicata da ISPRA](https://specieinvasive.isprambiente.it/images/rendicontazione_2025/MASEREGISTRO_UFFICIALE20240149728.pdf).
Sono caselle PEC. Per il Piemonte l'app usa la casella tematica `specie.invasive@regione.piemonte.it`
indicata nella [pagina regionale](https://www.regione.piemonte.it/web/temi/ambiente-territorio/biodiversita-aree-naturali/salvaguardia-ambientale/specie-vegetali-esotiche-invasive);
per Lombardia, Veneto, Friuli-Venezia Giulia e Lazio è indicata anche la pagina regionale sulle specie
esotiche invasive. Verificati il 6 novembre 2026. Gli enti parco non sono ancora inclusi.

## Specie simili

La sezione "Con cosa si può confondere" riporta **citazioni letterali** dalle schede ISPRA
(CC BY 4.0), scelte a mano tra le frasi che descrivono una possibile confusione
(`scripts/build_lookalikes.py` → `assets/data/lookalikes.json`). Lo script estrae il testo
dalla scheda scaricata: se ISPRA cambia una frase, la voce viene omessa e segnalata. Per le
specie la cui scheda ISPRA non parla di confusioni non viene aggiunto nulla.

## Dati europei (EASIN)

La sezione "In Europa" usa il catalogo [EASIN](https://easin.jrc.ec.europa.eu/) della Commissione
europea (JRC), tramite la sua API pubblica (`scripts/fetch_easin.py` → `assets/data/easin.json`):
prima introduzione nota in Europa, paesi in cui la specie è presente, vie di introduzione e settori
con impatti negativi, con le categorie tradotte in italiano. Citazione richiesta da EASIN:
*European Commission - Joint Research Centre - European Alien Species Information Network (EASIN)*.
I contenuti della Commissione sono riutilizzabili con licenza CC BY 4.0
([note legali](https://commission.europa.eu/legal-notice_en)). Questi dati completano anche le
schede ISPRA ancora incomplete.

## Foto delle specie (iNaturalist)

Le foto nelle schede vengono da [iNaturalist](https://www.inaturalist.org): solo foto con licenza
**CC0** o **CC BY**, mai "tutti i diritti riservati", CC BY-NC o CC BY-SA. Per ogni foto sono
riportati autore, licenza e pagina originale (`assets/data/photos.json`, generato da
`scripts/fetch_species_photos.py`); l'app li mostra sotto ogni foto. Le immagini non sono incluse
nell'app: vengono caricate da iNaturalist quando si apre la scheda.

Per tre specie iNaturalist usa un nome più recente: *Andropogon virginicus* → *Anatherum virginicum*,
*Nanozostera japonica* → *Zostera japonica*, *Prosopis juliflora* → *Neltuma juliflora*.

## Normativa

La sezione "Cosa dice la legge" è una sintesi del D.Lgs. 15 dicembre 2017, n. 230 (testo
vigente su [Normattiva](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2017-12-15;230))
e della pagina del [Ministero dell'Ambiente](https://www.mase.gov.it/portale/specie-esotiche-invasive),
in `src/data/legal.js`. Non sostituisce il testo di legge.

## Elenco delle specie

- Regolamento (UE) n. 1143/2014 e Regolamento di esecuzione (UE) 2016/1141, aggiornato dai
  Reg. di esecuzione 2017/1263, 2019/1262, 2022/1203, 2025/1422 ([EUR-Lex](https://eur-lex.europa.eu/eli/reg_impl/2025/1422/oj)).
- Nomi comuni italiani: [ISPRA – specie di rilevanza unionale](https://www.specieinvasive.isprambiente.it/specie-di-rilevanza-unionale/specie-di-rilevanza-unionale-2).

## Cosa NON è nel repository

La cartella `data/` (dati GBIF completi, circa 22 MB) non è versionata: si rigenera con
`sync_ias_data.py --all`. Sono versionati solo i file derivati usati dall'app
(`assets/data/species/` e `src/data/species.js`).
