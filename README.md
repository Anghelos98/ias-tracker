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

- Elenco delle 49 specie di rilevanza unionale, con nome comune e scientifico
- Mappa a schermo intero con la posizione dell'utente
- Raggruppamento delle segnalazioni vicine (cluster numerati) per una mappa fluida
- Scheda della segnalazione: anno, fonte, coordinate e incertezza della posizione
- Filtro per escludere le identificazioni solo automatiche (Pl@ntNet)
- Scheda di ogni specie: come riconoscerla, cosa dice la legge (D.Lgs. 230/2017), cosa fare
  se la trovi, approfondimenti e mappa di distribuzione ISPRA

## Struttura del progetto

```
App.js                      schermata principale (mappa)
src/components/             pannello specie, scheda segnalazione, marker
src/hooks/useClusters.js    raggruppamento con supercluster
src/utils/geo.js            calcoli su zoom, coordinate e proiezione
src/components/SpeciesSheet.js  scheda della specie
src/data/species.js         catalogo specie (generato)
src/data/legal.js           sintesi della normativa (D.Lgs. 230/2017)
assets/data/sheets/         schede delle specie ISPRA (generate)
assets/data/species/        segnalazioni per specie, formato compatto (generato)
ias_reference.json          elenco delle specie di rilevanza unionale
sync_ias_data.py            scarica le segnalazioni da GBIF in data/ (non versionata)
scripts/build_app_data.py   converte data/ nei file usati dall'app
scripts/fetch_ispra_sheets.py  scarica le schede delle specie dal sito ISPRA
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
npm run lint
npx expo-doctor
```

## Aggiornare i dati

Requisiti: Python 3.10+.

```bash
python3 -m venv .venv
.venv/bin/pip install requests beautifulsoup4
.venv/bin/python sync_ias_data.py --all          # scarica/aggiorna le segnalazioni da GBIF
.venv/bin/python scripts/fetch_ispra_sheets.py   # scarica/aggiorna le schede ISPRA
.venv/bin/python scripts/build_app_data.py       # rigenera assets/data e src/data/species.js
```

## Dati e licenze

Il **codice** è rilasciato con licenza [MIT](LICENSE).

I **dati** delle segnalazioni non sono coperti dalla licenza del codice: ogni record
mantiene la licenza del dataset di origine (CC0, CC BY o CC BY-NC). Vedi [DATI.md](DATI.md)
per fonti, licenze e come citarle.
