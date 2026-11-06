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

## Elenco delle specie

- Regolamento (UE) n. 1143/2014 e Regolamento di esecuzione (UE) 2016/1141, aggiornato dai
  Reg. di esecuzione 2017/1263, 2019/1262, 2022/1203, 2025/1422 ([EUR-Lex](https://eur-lex.europa.eu/eli/reg_impl/2025/1422/oj)).
- Nomi comuni italiani: [ISPRA – specie di rilevanza unionale](https://www.specieinvasive.isprambiente.it/specie-di-rilevanza-unionale/specie-di-rilevanza-unionale-2).

## Cosa NON è nel repository

La cartella `data/` (dati GBIF completi, circa 22 MB) non è versionata: si rigenera con
`sync_ias_data.py --all`. Sono versionati solo i file derivati usati dall'app
(`assets/data/species/` e `src/data/species.js`).
