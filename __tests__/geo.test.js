import {
  bboxToRegion,
  findTappedFeature,
  latitudeToScreenY,
  longitudeToScreenX,
  regionToZoom,
  shiftCenterLatitude,
} from '../src/utils/geo';

const REGION = { latitude: 41.9, longitude: 12.5, latitudeDelta: 1, longitudeDelta: 1 };
const SIZE = { width: 400, height: 800 };
const point = (lon, lat, props = {}) => ({ geometry: { coordinates: [lon, lat] }, properties: props });

describe('proiezione e coordinate', () => {
  test('il centro della regione è al centro dello schermo', () => {
    expect(longitudeToScreenX(12.5, REGION, SIZE.width)).toBeCloseTo(200);
    expect(latitudeToScreenY(41.9, REGION, SIZE.height)).toBeCloseTo(400, 6);
    // anche con zoom molto lontano (vista Italia)
    const wide = { ...REGION, latitudeDelta: 11, longitudeDelta: 11 };
    expect(latitudeToScreenY(41.9, wide, SIZE.height)).toBeCloseTo(400, 6);
  });

  test('nord in alto, est a destra', () => {
    expect(latitudeToScreenY(42.2, REGION, SIZE.height)).toBeLessThan(400);
    expect(longitudeToScreenX(12.8, REGION, SIZE.width)).toBeGreaterThan(200);
  });

  test('lo spostamento del centro porta il punto dove richiesto', () => {
    const lat = 41.6;
    const y = latitudeToScreenY(lat, REGION, SIZE.height);
    const newLatitude = shiftCenterLatitude(REGION, SIZE.height, y - 300);
    const after = latitudeToScreenY(lat, { ...REGION, latitude: newLatitude }, SIZE.height);
    expect(Math.abs(after - 300)).toBeLessThan(1);
  });

  test('zoom maggiore per regioni più piccole, sempre tra 0 e 20', () => {
    expect(regionToZoom({ ...REGION, longitudeDelta: 0.01 })).toBeGreaterThan(regionToZoom(REGION));
    expect(regionToZoom({ ...REGION, longitudeDelta: 1e-9 })).toBe(20);
    expect(regionToZoom({ ...REGION, longitudeDelta: 1e6 })).toBe(0);
  });

  test('bboxToRegion contiene il riquadro con margine', () => {
    const r = bboxToRegion([10, 40, 12, 42]);
    expect(r.latitude).toBe(41);
    expect(r.longitude).toBe(11);
    expect(r.latitudeDelta).toBeGreaterThan(2);
  });
});

describe('findTappedFeature', () => {
  const tap = { latitude: 41.9, longitude: 12.5 };
  const radius = () => 20;

  test('sceglie il punto più vicino entro il raggio', () => {
    const near = point(12.5005, 41.9);
    const nearer = point(12.5001, 41.9);
    expect(findTappedFeature([near, nearer], tap, REGION, SIZE, radius)).toBe(nearer);
  });

  test('ignora i punti fuori dal raggio', () => {
    const far = point(12.6, 41.9); // ~40 px a destra
    expect(findTappedFeature([far], tap, REGION, SIZE, radius)).toBeNull();
  });

  test('usa il raggio di ciascun elemento', () => {
    const cluster = point(12.6, 41.9, { cluster: true });
    const hit = findTappedFeature([cluster], tap, REGION, SIZE, (f) => (f.properties.cluster ? 50 : 20));
    expect(hit).toBe(cluster);
  });
});
