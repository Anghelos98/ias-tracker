import { DEFAULT_FILTERS } from '../src/data/points';
import { exportFileName, exportRows, toCSV, toGeoJSON, toKML } from '../src/data/exportData';

const DATASETS = [
  {
    species: { slug: 'ailanto', commonName: 'Ailanto', scientificName: 'Ailanthus altissima' },
    data: {
      fonti: [
        { nome: 'Herbarium, "Roma"', licenza: 'CC BY 4.0' },
        { nome: 'Pl@ntNet automatically identified occurrences', licenza: 'CC BY 4.0' },
      ],
      punti: [
        [12.5, 41.9, 2020, 0, 0, 10, 12],
        [9.19, 45.46, 2018, 0, 0, null], // dati senza regione (formato precedente)
        [12.6, 41.8, 2021, 1, 1, 5],
      ],
    },
  },
];

test('righe filtrate e limitate all’area', () => {
  expect(exportRows(DATASETS, DEFAULT_FILTERS)).toHaveLength(2); // esclusa l'automatica
  const lazio = exportRows(DATASETS, DEFAULT_FILTERS, [11, 41, 14, 43]);
  expect(lazio).toHaveLength(1);
  expect(lazio[0]).toMatchObject({ specie: 'Ailanthus altissima', anno: 2020, licenza: 'CC BY 4.0' });
});

test('CSV con intestazione e campi tra virgolette quando serve', () => {
  const csv = toCSV(exportRows(DATASETS, DEFAULT_FILTERS));
  const lines = csv.trim().split('\n');
  expect(lines[0]).toBe(
    'specie,nome_comune,latitudine,longitudine,anno,incertezza_m,fonte,licenza,identificazione_automatica,regione,gbif,dato_originale',
  );
  expect(lines[1]).toBe('Ailanthus altissima,Ailanto,41.9,12.5,2020,10,"Herbarium, ""Roma""",CC BY 4.0,false,Lazio,,');
  expect(lines[2]).toContain(',2018,,'); // incertezza non indicata = campo vuoto
  expect(lines[2]).toMatch(/,false,,,$/); // regione e collegamenti non indicati = campi vuoti
});

test('GeoJSON valido con attribuzione', () => {
  const geo = JSON.parse(toGeoJSON(exportRows(DATASETS, DEFAULT_FILTERS), { specie: 'Ailanto' }));
  expect(geo.type).toBe('FeatureCollection');
  expect(geo.features[0].geometry.coordinates).toEqual([12.5, 41.9]);
  expect(geo.metadata.attribuzione).toContain('GBIF.org');
  expect(geo.metadata.specie).toBe('Ailanto');
});

test('KML con testo protetto per XML', () => {
  const kml = toKML(exportRows(DATASETS, DEFAULT_FILTERS), 'Prova & test');
  expect(kml).toContain('<name>Prova &amp; test</name>');
  expect(kml).toContain('<coordinates>12.5,41.9,0</coordinates>');
  expect(kml).toContain('Herbarium, &quot;Roma&quot;');
  expect((kml.match(/<Placemark>/g) || []).length).toBe(2);
});

test('nome del file', () => {
  expect(exportFileName('ailanthus-altissima', 'kml', new Date('2026-11-06T10:00:00Z'))).toBe(
    'ias-tracker_ailanthus-altissima_2026-11-06.kml',
  );
});
