// Testo delle segnalazioni e lettura della posizione dalle foto: funzioni pure, testate in __tests__/.

import { entryKind, interventionLabel } from './notebook';

function formatCoordinate(value) {
  return value.toFixed(6);
}

export function reportSubject(report) {
  if (entryKind(report) === 'intervento') {
    return `Intervento su specie esotica invasiva (${interventionLabel(report.intervention).toLowerCase()}): ${report.scientificName}`;
  }
  return `Segnalazione specie esotica invasiva: ${report.scientificName}`;
}

/** Testo della segnalazione, uguale per email e condivisione. */
export function reportBody(report) {
  const date = new Date(report.createdAt).toLocaleString('it-IT', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const lat = formatCoordinate(report.latitude);
  const lon = formatCoordinate(report.longitude);
  const accuracy = report.accuracy != null ? ` (precisione ± ${Math.round(report.accuracy)} m)` : '';
  const source = report.locationSource === 'foto' ? ' – posizione ricavata dalla foto' : ' – posizione GPS';
  const intervention = entryKind(report) === 'intervento';
  const lines = [
    intervention
      ? 'Intervento di gestione su specie esotica invasiva di rilevanza unionale (Reg. UE 1143/2014, D.Lgs. 230/2017).'
      : 'Segnalazione di specie esotica invasiva di rilevanza unionale (Reg. UE 1143/2014, D.Lgs. 230/2017).',
    '',
    `Specie: ${report.commonName} (${report.scientificName})`,
    ...(intervention ? [`Intervento: ${interventionLabel(report.intervention)}`] : []),
    `Data e ora: ${date}`,
    `Coordinate (WGS84): ${lat}, ${lon}${accuracy}${source}`,
    `Mappa: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`,
  ];
  if (report.note?.trim()) lines.push(`Note: ${report.note.trim()}`);
  if (report.signature?.trim()) lines.push(`Rilevatore: ${report.signature.trim()}`);
  lines.push(
    `Foto: ${report.photos.length ? `${report.photos.length} allegate` : 'nessuna'}`,
    '',
    'Inviata con AlienHub, app gratuita e open source.',
  );
  return lines.join('\n');
}

/** Posizione GPS contenuta nei dati EXIF di una foto, se presente. */
export function gpsFromExif(exif) {
  if (!exif) return null;
  const toDecimal = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    // formato razionale "41/1,53/1,4567/100" (gradi, minuti, secondi)
    const parts = value.split(',').map((p) => {
      const [n, d] = p.split('/').map(Number);
      return d ? n / d : n;
    });
    if (parts.some(Number.isNaN)) return null;
    return (parts[0] ?? 0) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  };
  const gps = exif['{GPS}'] ?? exif;
  const lat = toDecimal(gps.Latitude ?? gps.GPSLatitude);
  const lon = toDecimal(gps.Longitude ?? gps.GPSLongitude);
  if (lat == null || lon == null || (lat === 0 && lon === 0)) return null;
  const latRef = gps.LatitudeRef ?? gps.GPSLatitudeRef;
  const lonRef = gps.LongitudeRef ?? gps.GPSLongitudeRef;
  const latitude = latRef === 'S' ? -Math.abs(lat) : lat;
  const longitude = lonRef === 'W' ? -Math.abs(lon) : lon;
  // Dati EXIF scritti male (app di terzi, foto modificate): coordinate impossibili finirebbero
  // nelle segnalazioni inviate e nei file esportati, e "Mappa" del taccuino chiederebbe alla
  // mappa una regione non valida (Apple Maps la rifiuta con un errore che chiude l'app).
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
