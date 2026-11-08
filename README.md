# IAS Tracker

App mobile gratuita e open source che mostra su mappa le segnalazioni in Italia delle
**piante esotiche invasive di rilevanza unionale** (Regolamento UE 1143/2014 e
aggiornamenti fino al Reg. di esecuzione UE 2025/1422).

Le segnalazioni provengono da [GBIF](https://www.gbif.org), che riunisce i dati di
iNaturalist, Pl@ntNet, Wikiplantbase, erbari e altre banche dati: IAS Tracker le mette
insieme in un'unica mappa, per l'Italia e in italiano.

Pensata sia per il pubblico (escursionisti, appassionati, chi ha un giardino) sia per i
professionisti (enti parco, comuni, agronomi, vivaisti).

## Funzioni

- Presentazione al primo avvio (cos'è l'app, da dove vengono i dati, come si usa)
- Elenco delle 49 specie di rilevanza unionale, con nome comune e scientifico
- Vista "Tutte le specie": tutte le segnalazioni insieme sulla mappa, con la specie di ogni punto
- Mappa a schermo intero con la posizione dell'utente
- Raggruppamento delle segnalazioni vicine (cluster numerati) per una mappa fluida
- Scheda della segnalazione: anno, fonte, coordinate e incertezza della posizione, con i
  collegamenti al dato originale ("Vedi su GBIF", "Vedi su iNaturalist" o "Vedi su Pl@ntNet")
- Esportazione delle segnalazioni mostrate (area visibile o tutta Italia) in CSV, GeoJSON o KML,
  con fonte e licenza di ogni dato
- Filtri per periodo, precisione della posizione e identificazioni automatiche (Pl@ntNet),
  salvati sul telefono; le posizioni approssimative (oltre 1 km) hanno un pallino vuoto
- Griglia ufficiale ISPRA 10×10 km sovrapponibile alla mappa, per confrontarla con le segnalazioni
- "Vicino a me": specie segnalate entro 1, 5, 10 o 25 km dalla propria posizione, con la
  distanza della segnalazione più vicina
- Scheda di ogni specie: foto (iNaturalist, CC0/CC BY), come riconoscerla, con cosa si può
  confondere, dati europei EASIN (diffusione, vie di introduzione, impatti), cosa dice la legge
  (D.Lgs. 230/2017), cosa fare se la trovi, approfondimenti e mappa di distribuzione ISPRA
- Segnalazioni: specie, posizione GPS automatica e foto in pochi tocchi; invio per email al
  Ministero dell'Ambiente (casella prevista dall'art. 18 del D.Lgs. 230/2017), all'ufficio della
  Regione in cui ci si trova (riconosciuta dalla posizione) o condivisione con qualsiasi app
- Taccuino di campo: presenze e interventi di gestione (taglio, sfalcio, eradicazione,
  cercinatura, trattamento, smaltimento, controllo) salvati sul telefono, con foto e note,
  esportabili in CSV, GeoJSON o KML
- Rapporto per regione (confini ISTAT): segnalazioni e specie di ogni regione, andamento negli
  ultimi 15 anni, rapporto in PDF (grafico, tabella, fonti) o tabella in CSV, uffici regionali
  a cui segnalare; rispetta i filtri attivi
- Novità della settimana: segnalazioni comparse su GBIF dall'aggiornamento precedente e prime
  segnalazioni di una specie in una regione
- Specie e regioni seguite: le loro novità in evidenza all'apertura, con avviso facoltativo
  (notifica locale dopo l'aggiornamento settimanale, senza posizione e senza server)
- Modalità scura automatica (segue le impostazioni del telefono) e accessibilità: etichette per
  VoiceOver e TalkBack, testo che si ingrandisce con le impostazioni di sistema, colori con
  contrasto di almeno 4,5:1 (WCAG AA)

## Struttura del progetto

```
App.js                      schermata principale (mappa)
src/components/             pannello specie, scheda segnalazione, marker
src/hooks/useClusters.js    raggruppamento con supercluster
src/utils/geo.js            calcoli su zoom, coordinate e proiezione
src/components/SpeciesSheet.js  scheda della specie
src/components/FiltersPanel.js  filtri della mappa e legenda
src/components/NearbyPanel.js   "Vicino a me"
src/components/ReportScreen.js  nuova voce del taccuino: presenza o intervento (GPS, foto, invio)
src/components/Notebook.js      taccuino di campo (elenco, filtri, esportazione)
src/components/RegionReport.js  rapporto per regione
src/reports/                    salvataggio, invio ed esportazione delle voci del taccuino
src/data/regionReport.js        calcolo del rapporto per regione
src/data/regions.js         regioni ISTAT: nomi e riquadri (generato)
src/theme.js                colori del tema chiaro e scuro
src/data/species.js         catalogo specie (generato)
src/data/legal.js           sintesi della normativa (D.Lgs. 230/2017)
src/data/contacts.js        uffici regionali per le specie esotiche invasive (fonte: Ministero)
src/data/news.js            novità della settimana, specie e regioni seguite
src/components/NewsScreen.js  schermata delle novità e delle specie/regioni seguite
src/notifications/          avviso facoltativo sulle novità (attività in background + notifica locale)
src/reports/regionReportHtml.js  rapporto per regione in HTML, convertito in PDF con expo-print
assets/data/sheets/         schede delle specie ISPRA (generate)
assets/data/species/        segnalazioni per specie, formato compatto (generato)
ias_reference.json          elenco delle specie di rilevanza unionale
sync_ias_data.py            scarica le segnalazioni da GBIF in data/ (non versionata)
scripts/build_app_data.py   converte data/ nei file usati dall'app
scripts/fetch_ispra_sheets.py  scarica le schede delle specie dal sito ISPRA
scripts/fetch_species_photos.py  raccoglie le foto delle specie da iNaturalist
scripts/build_lookalikes.py specie simili (citazioni dalle schede ISPRA)
scripts/fetch_easin.py      dati europei dal catalogo EASIN
scripts/fetch_ispra_grids.py  griglia ISPRA 10×10 km (shapefile → aree in WGS84)
scripts/fetch_istat_regions.py  confini delle regioni ISTAT (si esegue a mano, di rado)
scripts/data/regioni.json   confini semplificati usati per assegnare la regione ai punti
scripts/build_news.py       novità della settimana (confronto con i dati pubblicati)
scripts/build_region_shapes.py  confini semplificati per riconoscere la regione dalla posizione
scripts/build_site.py       prepara il sito GitHub Pages con i dati per l'app
site/privacy.html           informativa sulla privacy (pubblicata su GitHub Pages)
app.config.js               aggiunge account Expo, progetto EAS e chiave Google Maps da variabili d'ambiente
eas.json                    profili di build EAS (preview e production)
scripts/make_icons.py       icona dell'app, icone Android e schermata di avvio
src/data/remote.js          aggiornamento dei dati nell'app (manifest, download, cache)
.github/workflows/          aggiornamento settimanale automatico
```

## Avviare l'app

Requisiti: Node.js e l'app [Expo Go](https://expo.dev/go) sul telefono.

```bash
npm install
npx expo start
```

Poi apri il progetto da Expo Go (QR code o URL `exp://<IP del computer>:8081`).

Controlli del codice:

```bash
npm run lint                       # stile e possibili errori
npm test                           # test dell'app (Jest)
.venv/bin/python -m pytest tests   # test degli script dati
npx expo-doctor                    # configurazione Expo
```

Gli stessi controlli girano su GitHub a ogni push (workflow [`Controlli`](.github/workflows/ci.yml)).

## Aggiornare i dati

Requisiti: Python 3.12 o successivo (quello usato da GitHub Actions). Le versioni dei pacchetti sono
fissate (con le impronte) in `requirements.txt`, le stesse del workflow che pubblica i dati.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python sync_ias_data.py --all          # scarica/aggiorna le segnalazioni da GBIF
.venv/bin/python scripts/fetch_ispra_sheets.py   # scarica/aggiorna le schede ISPRA
.venv/bin/python scripts/build_lookalikes.py     # specie simili dalle schede ISPRA
.venv/bin/python scripts/fetch_easin.py          # dati europei EASIN
.venv/bin/python scripts/fetch_ispra_grids.py    # griglia ISPRA 10×10 km
.venv/bin/python scripts/fetch_species_photos.py # raccoglie le foto da iNaturalist
.venv/bin/python scripts/build_app_data.py       # rigenera assets/data e src/data/species.js
.venv/bin/python scripts/build_news.py           # novità rispetto ai dati pubblicati su GitHub Pages
```

I confini delle regioni cambiano di rado e sono già nel repository; per aggiornarli (per esempio
a un nuovo anno ISTAT): `.venv/bin/python scripts/fetch_istat_regions.py 2027`, poi
`build_app_data.py` e `build_region_shapes.py`.

## Build per gli store (EAS)

Account Expo e ID del progetto EAS non sono nel repository: vanno in un file `.env.local`
(escluso da git) nella cartella del progetto:

```bash
EXPO_OWNER=<il-tuo-account-expo>
EAS_PROJECT_ID=<id-del-progetto-su-expo.dev>
```

Per un nuovo progetto: `npx eas-cli@latest init`, poi spostare `owner` ed `extra.eas.projectId`
che il comando scrive in `app.json` nel file `.env.local`. I comandi EAS si avviano con
`npm run eas --`, che legge `.env.local`:

```bash
npm run eas -- build --profile preview -p ios    # build di prova da installare sul telefono
npm run eas -- build --profile production        # build per App Store e Google Play
```

`.easignore` replica `.gitignore` ma include `.env.local`, così la build su EAS riceve gli stessi valori.

Il numero di build lo gestisce EAS (`appVersionSource: remote`, `autoIncrement`). Per Android serve
una chiave Google Maps: crearla nella console Google Cloud, limitarla al pacchetto
`io.github.anghelos98.iastracker` e all'impronta SHA-1 del certificato, e salvarla su expo.dev come
variabile d'ambiente `GOOGLE_MAPS_ANDROID_API_KEY` (ambienti preview e production, visibilità
"Sensitive"). Non va mai scritta nel repository.

## Aggiornamento automatico dei dati

Ogni lunedì il workflow [`Aggiorna dati`](.github/workflows/update-data.yml) di GitHub Actions
scarica le segnalazioni da GBIF e le schede da ISPRA, e pubblica i file su GitHub Pages:
<https://anghelos98.github.io/ias-tracker/> (indice in `data/v1/manifest.json`).

L'app controlla il manifest al massimo ogni 12 ore, scarica solo i file cambiati e li salva sul
telefono: i dati si aggiornano senza pubblicare una nuova versione. Senza rete usa i dati già
scaricati o quelli inclusi nell'app. Il workflow si può avviare anche a mano da GitHub
(Actions → Aggiorna dati → Run workflow).

## Dati e licenze

Il **codice** è rilasciato con licenza [MIT](LICENSE).

I **dati** delle segnalazioni non sono coperti dalla licenza del codice: ogni record
mantiene la licenza del dataset di origine (CC0, CC BY o CC BY-NC). Vedi [DATI.md](DATI.md)
per fonti, licenze e come citarle.
