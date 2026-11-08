import {
  bboxToRegion,
  findFeatureAtPoint,
  findTappedFeature,
  latitudeToScreenY,
  longitudeToScreenX,
  NO_INSETS,
  insetsFromEdges,
  regionCorners,
  regionToZoom,
  screenProjector,
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

describe('findFeatureAtPoint', () => {
  test('punto dello schermo: il centro della mappa corrisponde al centro della regione', () => {
    const center = point(12.5, 41.9);
    const right = point(12.5 + 30 / 400, 41.9); // 30 px a destra del centro
    const radius = () => 24;
    expect(findFeatureAtPoint([center, right], { x: 200, y: 400 }, REGION, SIZE, radius)).toBe(center);
    expect(findFeatureAtPoint([center, right], { x: 228, y: 400 }, REGION, SIZE, radius)).toBe(right);
    expect(findFeatureAtPoint([center], { x: 260, y: 400 }, REGION, SIZE, radius)).toBeNull();
  });
});

describe('findFeatureAtPoint: bordo più vicino', () => {
  // 1 px = 1/400 di grado in longitudine con REGION e SIZE
  const px = (n) => n / 400;
  const area = (f) => (f.properties.cluster ? { visual: 27, slop: 16 } : { visual: 7, slop: 26 });

  test('un tocco dentro un gruppo grande sceglie il gruppo anche se un pallino è vicino', () => {
    const cluster = point(12.5, 41.9, { cluster: true });
    const dot = point(12.5 + px(45), 41.9);
    // 20 px dal centro del gruppo (dentro il cerchio), 25 px dal pallino
    expect(findFeatureAtPoint([dot, cluster], { x: 220, y: 400 }, REGION, SIZE, area)).toBe(cluster);
  });

  test('tra due pallini vince il più vicino; lontano da tutto nessuno', () => {
    const a = point(12.5, 41.9);
    const b = point(12.5 + px(40), 41.9);
    expect(findFeatureAtPoint([a, b], { x: 215, y: 400 }, REGION, SIZE, area)).toBe(a);
    expect(findFeatureAtPoint([a, b], { x: 228, y: 400 }, REGION, SIZE, area)).toBe(b);
    expect(findFeatureAtPoint([a], { x: 200, y: 432 }, REGION, SIZE, area)).toBe(a); // 32 px: ancora preso
    expect(findFeatureAtPoint([a], { x: 200, y: 440 }, REGION, SIZE, area)).toBeNull();
  });
});

describe('bordi della regione in Mercatore', () => {
  // Riferimento: la bisezione usata prima della formula chiusa.
  const toM = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const fromM = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
  function referenceY(lat, region, height) {
    const c = toM(region.latitude);
    let lo = 0;
    let hi = 10;
    for (let i = 0; i < 100; i += 1) {
      const mid = (lo + hi) / 2;
      if (fromM(c + mid) - fromM(c - mid) < region.latitudeDelta) lo = mid;
      else hi = mid;
    }
    const k = (lo + hi) / 2;
    return ((c + k - toM(lat)) / (2 * k)) * height;
  }

  test.each([
    [41.9, 0.005],
    [41.9, 1],
    [41.9, 11],
    [0, 20],
    [-33, 4],
    [60, 30],
  ])('formula chiusa uguale alla bisezione (centro %p, ampiezza %p)', (latitude, latitudeDelta) => {
    const region = { latitude, longitude: 12.5, latitudeDelta, longitudeDelta: latitudeDelta };
    for (const f of [-0.5, -0.3, 0, 0.2, 0.5]) {
      const lat = latitude + f * latitudeDelta;
      expect(latitudeToScreenY(lat, region, SIZE.height)).toBeCloseTo(referenceY(lat, region, SIZE.height), 5);
    }
  });

  test('screenProjector coincide con le conversioni singole', () => {
    const project = screenProjector(REGION, SIZE);
    expect(project.x(12.7)).toBeCloseTo(longitudeToScreenX(12.7, REGION, SIZE.width), 9);
    expect(project.y(42.1)).toBeCloseTo(latitudeToScreenY(42.1, REGION, SIZE.height), 9);
  });
});

describe('riquadro reale della regione (margini misurati dalla mappa)', () => {
  const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

  test('gli angoli della regione cadono sui bordi del riquadro', () => {
    const { northWest, southEast } = regionCorners(REGION);
    const plain = screenProjector(REGION, SIZE);
    expect(plain.x(northWest.longitude)).toBeCloseTo(0, 6);
    expect(plain.y(northWest.latitude)).toBeCloseTo(0, 6);
    expect(plain.y(southEast.latitude)).toBeCloseTo(SIZE.height, 6);
    const inset = screenProjector(REGION, { ...SIZE, insets: INSETS });
    expect(inset.y(northWest.latitude)).toBeCloseTo(47, 6);
    expect(inset.y(southEast.latitude)).toBeCloseTo(SIZE.height - 34, 6);
    expect(inset.x(southEast.longitude)).toBeCloseTo(SIZE.width, 6);
  });

  test('margini ricavati dai punti degli angoli; valori non plausibili scartati', () => {
    expect(insetsFromEdges({ x: 0, y: 47 }, { x: 400, y: 766 }, SIZE)).toEqual({
      top: 47,
      left: 0,
      bottom: 34,
      right: 0,
    });
    expect(insetsFromEdges({ x: 0, y: 0 }, { x: 0, y: 0 }, SIZE)).toBeNull(); // misura vuota
    expect(insetsFromEdges({ x: 0, y: 400 }, { x: 400, y: 800 }, SIZE)).toBeNull(); // metà schermo
    expect(insetsFromEdges({ x: NaN, y: 0 }, { x: 400, y: 800 }, SIZE)).toBeNull();
    expect(insetsFromEdges(null, { x: 400, y: 800 }, SIZE)).toBeNull();
  });

  test('il marker toccato si trova con i margini: senza, il tocco cadrebbe fuori', () => {
    // pallino disegnato dalla mappa nel riquadro con i margini, toccato nel suo centro
    const dot = point(12.5, 42.25, {});
    const drawn = screenProjector(REGION, { ...SIZE, insets: INSETS });
    const tap = { x: drawn.x(12.5), y: drawn.y(42.25) };
    const area = () => ({ visual: 7, slop: 26 });
    expect(findFeatureAtPoint([dot], tap, REGION, { ...SIZE, insets: INSETS }, area)).toBe(dot);
    expect(findFeatureAtPoint([dot], tap, REGION, SIZE, area)).toBeNull();
  });

  test('lo spostamento del centro tiene conto dei margini', () => {
    const lat = 41.6;
    const y = latitudeToScreenY(lat, REGION, SIZE.height, INSETS);
    const newLatitude = shiftCenterLatitude(REGION, SIZE.height, y - 300, INSETS);
    const after = latitudeToScreenY(lat, { ...REGION, latitude: newLatitude }, SIZE.height, INSETS);
    expect(Math.abs(after - 300)).toBeLessThan(1); // come senza margini: ampiezza in gradi invariata
    expect(latitudeToScreenY(lat, REGION, SIZE.height, NO_INSETS)).toBeCloseTo(
      latitudeToScreenY(lat, REGION, SIZE.height),
      9,
    );
  });
});
