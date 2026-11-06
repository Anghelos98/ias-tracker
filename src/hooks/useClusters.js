import { useCallback, useMemo } from 'react';
import Supercluster from 'supercluster';

import { regionToBBox, regionToZoom } from '../utils/geo';

// Parametri di raggruppamento:
// - radius: due segnalazioni restano separate solo se sullo schermo distano almeno
//   40 px (il marker a pallino occupa 32 px): così i pallini non si sovrappongono mai.
// - minPoints 2: anche due sole segnalazioni vicine formano un cluster.
// - maxZoom 20 (il massimo della mappa): il raggruppamento resta attivo a ogni zoom.
//   Segnalazioni ancora sovrapposte allo zoom massimo restano un cluster, che al tocco
//   mostra l'elenco delle segnalazioni.
export const CLUSTER_MAX_ZOOM = 20;
// extent 256: il raggio è espresso in pixel reali dello schermo (le tile della mappa sono
// da 256 px; con il default di supercluster, 512, il raggio effettivo sarebbe la metà).
const CLUSTER_OPTIONS = { radius: 40, extent: 256, minPoints: 2, maxZoom: CLUSTER_MAX_ZOOM };

// Margine attorno allo schermo (frazione della regione visibile) entro cui i cluster
// vengono già calcolati: evita che compaiano "a scatti" ai bordi durante il pan.
const VIEWPORT_MARGIN = 0.15;

/**
 * Raggruppa i punti di una specie con supercluster e restituisce solo ciò che è
 * dentro (o appena fuori) lo schermo: i marker fuori vista non vengono creati.
 *
 * @param {{fonti: {nome: string, licenza: string|null}[], punti: Array<[number, number, number|null, number, 0|1, number|null]>} | null} data
 * @param {object} region  regione visibile della mappa
 * @param {boolean} includeAutomatic  includere le identificazioni solo automatiche
 */
export function useClusters(data, region, includeAutomatic) {
  // L'indice si ricostruisce solo quando cambiano dati o filtro, non a ogni pan/zoom.
  const index = useMemo(() => {
    if (!data) return null;
    // Record con coordinate identiche diventano UN solo punto con l'elenco dei record:
    // altrimenti sulla mappa sarebbero segnalini perfettamente sovrapposti.
    const byLocation = new Map();
    let count = 0;
    data.punti.forEach(([lon, lat, year, sourceIdx, automatic, uncertainty], i) => {
      if (!includeAutomatic && automatic) return;
      const key = `${lon},${lat}`;
      let location = byLocation.get(key);
      if (!location) {
        location = { lon, lat, records: [] };
        byLocation.set(key, location);
      }
      location.records.push({
        id: i,
        year,
        source: data.fonti[sourceIdx].nome,
        license: data.fonti[sourceIdx].licenza,
        automatic: automatic === 1,
        uncertainty: uncertainty ?? null,
      });
      count += 1;
    });

    const features = [];
    for (const { lon, lat, records } of byLocation.values()) {
      records.sort((r1, r2) => (r2.year ?? 0) - (r1.year ?? 0));
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: records[0].id,
          records,
          automatic: records.every((r) => r.automatic),
        },
      });
    }

    const sc = new Supercluster({
      ...CLUSTER_OPTIONS,
      // il numero mostrato sui cluster è il numero di segnalazioni, non di posizioni
      map: (props) => ({ records: props.records.length }),
      reduce: (acc, props) => {
        acc.records += props.records;
      },
    });
    sc.load(features);
    return { sc, count };
  }, [data, includeAutomatic]);

  const zoom = regionToZoom(region);

  const clusters = useMemo(() => {
    if (!index) return [];
    const padded = {
      ...region,
      latitudeDelta: region.latitudeDelta * (1 + 2 * VIEWPORT_MARGIN),
      longitudeDelta: region.longitudeDelta * (1 + 2 * VIEWPORT_MARGIN),
    };
    return index.sc.getClusters(regionToBBox(padded), zoom);
  }, [index, region, zoom]);

  // Dipendono solo dall'indice: restano stabili durante pan/zoom (niente re-render dei marker).
  const expansionZoom = useCallback((clusterId) => index?.sc.getClusterExpansionZoom(clusterId) ?? 12, [index]);
  const leaves = useCallback((clusterId) => index?.sc.getLeaves(clusterId, Infinity) ?? [], [index]);

  return { clusters, zoom, visibleCount: index?.count ?? 0, expansionZoom, leaves };
}
