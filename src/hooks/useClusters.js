import { useCallback, useMemo } from 'react';
import Supercluster from 'supercluster';

import { groupDatasets } from '../data/points';
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
 * @param {{species: object, data: object}[] | null} datasets  punti di una o più specie (formato compatto)
 * @param {object} region  regione visibile della mappa
 * @param {import('../data/points').Filters} filters  filtri scelti dall'utente
 */
export function useClusters(datasets, region, filters) {
  // L'indice si ricostruisce solo quando cambiano dati o filtro, non a ogni pan/zoom.
  const index = useMemo(() => {
    if (!datasets?.length) return null;
    const { features, count } = groupDatasets(datasets, filters);

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
  }, [datasets, filters]);

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
