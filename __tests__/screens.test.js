// Prova di disegno delle schermate nei due temi: scopre errori a runtime (stili mancanti,
// componenti non definiti) che il lint non vede. Moduli nativi sostituiti da finti.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import FiltersPanel from '../src/components/FiltersPanel';
import Notebook from '../src/components/Notebook';
import NearbyPanel from '../src/components/NearbyPanel';
import PointCard from '../src/components/PointCard';
import RegionReport from '../src/components/RegionReport';
import ReportScreen from '../src/components/ReportScreen';
import SpeciesPanel from '../src/components/SpeciesPanel';
import SpeciesSheet from '../src/components/SpeciesSheet';
import WelcomeScreen from '../src/components/WelcomeScreen';
import { DEFAULT_FILTERS } from '../src/data/points';
import { SPECIES } from '../src/data/species';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4, Balanced: 3 },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-file-system', () => ({ Paths: {}, File: jest.fn(), Directory: jest.fn() }));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-mail-composer', () => ({}));

const NOTE = {
  id: 'x',
  kind: 'intervento',
  intervention: 'taglio',
  createdAt: '2026-11-06T10:00:00.000Z',
  speciesSlug: 'ailanthus-altissima',
  scientificName: 'Ailanthus altissima',
  commonName: 'Ailanto',
  latitude: 41.9,
  longitude: 12.5,
  accuracy: 5,
  locationSource: 'gps',
  note: 'prova',
  photos: [],
  sent: [],
};

const ailanto = SPECIES.find((s) => s.slug === 'ailanthus-altissima');
const noop = () => {};

describe.each(['light', 'dark'])('tema %s', (scheme) => {
  beforeEach(async () => {
    useColorScheme.mockReturnValue(scheme);
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem('ias-tracker/reports/v1', JSON.stringify([NOTE]));
  });

  test('elenco specie e filtri', async () => {
    await render(
      <SpeciesPanel
        species={SPECIES}
        allItem={{ slug: 'all', all: true, commonName: 'Tutte le specie', scientificName: 'x', total: 1 }}
        dataUpdatedAt="2026-11-06"
        visible
        onSelect={noop}
        onInfo={noop}
        onAbout={noop}
        onRegions={noop}
        onNotebook={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText('Rapporto per regione')).toBeTruthy();
    await render(
      <FiltersPanel
        visible
        filters={DEFAULT_FILTERS}
        onChange={noop}
        showGrid={false}
        onToggleGrid={noop}
        gridNote=""
        onClose={noop}
      />,
    );
    expect(screen.getByText('Legenda')).toBeTruthy();
  });

  test('scheda della specie, segnalazione sulla mappa, benvenuto', async () => {
    await render(<SpeciesSheet species={ailanto} manifest={null} visible onClose={noop} onOpenSpecies={noop} />);
    expect(await screen.findByText('Cosa dice la legge')).toBeTruthy();
    await render(
      <PointCard
        points={[
          {
            id: 1,
            species: ailanto,
            year: 2024,
            source: 'iNaturalist',
            license: 'CC BY 4.0',
            automatic: false,
            uncertainty: 12,
          },
        ]}
        coordinate={{ latitude: 41.9, longitude: 12.5 }}
        bottomInset={0}
        onClose={noop}
        onOpenSheet={noop}
      />,
    );
    expect(screen.getByText('± 12 m')).toBeTruthy();
    await render(<WelcomeScreen visible onDone={noop} />);
    expect(screen.getByText('Informativa sulla privacy ↗')).toBeTruthy();
  });

  test('nuova voce: presenza e intervento', async () => {
    await render(
      <ReportScreen visible initialSpecies={ailanto} initialKind="intervento" onClose={noop} onOpenNotebook={noop} />,
    );
    expect(screen.getByText('Nuovo intervento')).toBeTruthy();
    expect(screen.getByText('Cercinatura')).toBeTruthy();
    expect(await screen.findByText(/permesso di accesso alla posizione/)).toBeTruthy();
  });

  test('taccuino', async () => {
    await render(<Notebook visible onClose={noop} onShowOnMap={noop} onNewEntry={noop} />);
    expect(await screen.findByText('Intervento: Taglio')).toBeTruthy();
    expect(screen.getByText('Esporta 1 voce')).toBeTruthy();
  });

  test('rapporto per regione e vicino a me', async () => {
    const list = SPECIES.filter((s) => s.slug === 'ailanthus-altissima');
    await render(
      <RegionReport
        visible
        speciesList={list}
        manifest={null}
        filters={DEFAULT_FILTERS}
        onShowSpecies={noop}
        onInfo={noop}
        onClose={noop}
      />,
    );
    expect(await screen.findByText('Lazio')).toBeTruthy();
    await fireEvent.press(screen.getByText('Lazio'));
    expect(await screen.findByText('Andamento negli anni')).toBeTruthy();
    expect(screen.getByText('Ailanto')).toBeTruthy();
    await render(
      <NearbyPanel
        visible
        speciesList={list}
        manifest={null}
        filters={DEFAULT_FILTERS}
        onSelect={noop}
        onInfo={noop}
        onClose={noop}
      />,
    );
    expect(await screen.findByText(/permesso di accesso alla posizione/)).toBeTruthy();
  });
});
