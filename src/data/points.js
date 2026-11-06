// Trasformazione dei punti di una specie (formato compatto) in punti per la mappa.
// Funzioni pure, senza dipendenze dall'interfaccia: sono coperte dai test in __tests__/.

/**
 * Raggruppa i record per posizione: record con coordinate identiche diventano UN solo
 * punto con l'elenco dei record, altrimenti sulla mappa sarebbero segnalini sovrapposti.
 *
 * @param {{fonti: {nome: string, licenza: string|null}[], punti: Array<[number, number, number|null, number, 0|1, number|null]>}} data
 * @param {{includeAutomatic: boolean}} options
 * @returns {{features: object[], count: number}} punti GeoJSON e numero di record inclusi
 */
export function groupByLocation(data, { includeAutomatic }) {
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
  return { features, count };
}
