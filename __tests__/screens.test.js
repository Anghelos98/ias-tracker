// Prova di disegno delle schermate nei due temi: scopre errori a runtime (stili mancanti,
// componenti non definiti) che il lint non vede. Moduli nativi sostituiti da finti.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';

import FiltersPanel from '../src/components/FiltersPanel';
import NewsScreen from '../src/components/NewsScreen';
import Notebook from '../src/components/Notebook';
import NearbyPanel from '../src/components/NearbyPanel';
import PointCard from '../src/components/PointCard';
import RegionReport from '../src/components/RegionReport';
import ReportScreen from '../src/components/ReportScreen';
import SpeciesPanel from '../src/components/SpeciesPanel';
import SettingsScreen from '../src/components/SettingsScreen';
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
jest.mock('expo-print', () => ({}));

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
        onSettings={noop}
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
    await render(
      <SpeciesSheet
        species={ailanto}
        manifest={null}
        visible
        onClose={noop}
        onOpenSpecies={noop}
        followed
        onToggleFollow={noop}
      />,
    );
    expect(await screen.findByText('Cosa dice la legge')).toBeTruthy();
    expect(screen.getByText('★ Segui questa specie')).toBeTruthy();
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
            gbifUrl: 'https://www.gbif.org/occurrence/1',
            originalUrl: 'https://www.inaturalist.org/observations/2',
          },
        ]}
        coordinate={{ latitude: 41.9, longitude: 12.5 }}
        bottomInset={0}
        onClose={noop}
        onOpenSheet={noop}
      />,
    );
    expect(screen.getByText('± 12 m')).toBeTruthy();
    expect(screen.getByText('Vedi su iNaturalist ↗')).toBeTruthy();
    expect(screen.getByText('Vedi su GBIF ↗')).toBeTruthy();
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
        followedRegions={[12]}
        onToggleFollowRegion={noop}
      />,
    );
    expect(await screen.findByText('Lazio')).toBeTruthy();
    await fireEvent.press(screen.getByText('Lazio'));
    expect(await screen.findByText('Andamento negli anni')).toBeTruthy();
    expect(screen.getByText('Rapporto in PDF')).toBeTruthy();
    expect(screen.getByText('★ Segui questa regione')).toBeTruthy();
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

  test('impostazioni: aggiornamento manuale dei dati', async () => {
    let finish;
    const onUpdateNow = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render(
      <SettingsScreen
        visible
        onClose={noop}
        dataDate="2026-11-06T20:40:38+00:00"
        updating={false}
        onUpdateNow={onUpdateNow}
        onClearData={noop}
        mapType="standard"
        onChangeMapType={noop}
        showGrid={false}
        onToggleGrid={noop}
        filtersSummary="dal 2015"
        onResetFilters={noop}
        theme="auto"
        onChangeTheme={noop}
        signature=""
        onChangeSignature={noop}
        notify={false}
        canNotify={false}
        onToggleNotify={noop}
        onOpenWelcome={noop}
      />,
    );
    expect(screen.getByText('I dati dell’app vengono aggiornati ogni 12 ore per impostazione predefinita.')).toBeTruthy();
    expect(screen.getByText(/aggiornate al 6 novembre 2026/)).toBeTruthy();
    expect(screen.getByText('Ripristina i filtri predefiniti')).toBeTruthy();
    // il tocco resta in attesa dell'aggiornamento: non lo si aspetta qui
    const pressed = fireEvent.press(screen.getByText('Aggiorna ora'));
    expect(await screen.findByText('Aggiornamento dei dati in corso…')).toBeTruthy();
    expect(onUpdateNow).toHaveBeenCalledTimes(1);
    await act(async () => finish({ status: 'current' }));
    await pressed;
    expect(await screen.findByText('I dati sono già aggiornati.')).toBeTruthy();
    expect(screen.getByText('Aggiorna ora')).toBeTruthy();
  });

  test('novità e specie seguite', async () => {
    const news = {
      settimane: [
        {
          dati_al: '2026-11-16T04:00:00Z',
          precedenti_al: '2026-11-09T04:00:00Z',
          nuove: 3,
          specie: {
            'ailanthus-altissima': { nuove: 3, regioni: { 9: 2, 10: 1 }, prime_regioni: [10], prima_in_italia: false },
          },
        },
      ],
    };
    const props = {
      visible: true,
      news,
      seenAtOpen: null,
      speciesList: SPECIES,
      notify: false,
      onToggleNotify: noop,
      onToggleFollow: noop,
      onShowSpecies: noop,
      onInfo: noop,
      onClose: noop,
    };
    await render(<NewsScreen {...props} follows={{ species: [], regions: [] }} />);
    expect(screen.getByText('3 segnalazioni nuove di 1 specie')).toBeTruthy();
    expect(screen.getByText('Prima segnalazione in Umbria')).toBeTruthy();
    await fireEvent.press(screen.getByText('Seguite'));
    expect(screen.getByText('Scegli specie e regioni')).toBeTruthy();
    await fireEvent.press(screen.getByText('Scegli specie e regioni'));
    expect(screen.getByText('Specie e regioni seguite')).toBeTruthy();

    await render(<NewsScreen {...props} follows={{ species: [], regions: [10] }} />);
    await fireEvent.press(screen.getByText('Seguite'));
    expect(screen.getByText('1 segnalazione nuova nell’ultima settimana')).toBeTruthy();
    await render(
      <NewsScreen {...props} seenAtOpen="2026-11-09T04:00:00Z" follows={{ species: [], regions: [10] }} />,
    );
    await fireEvent.press(screen.getByText('Seguite'));
    expect(screen.getByText('1 segnalazione nuova dalla tua ultima visita')).toBeTruthy();
    expect(screen.getByText('Avvisami delle novità')).toBeTruthy();
    await render(<NewsScreen {...props} news={{ settimane: [] }} follows={{ species: [], regions: [] }} />);
    expect(screen.getByText(/prossimo aggiornamento settimanale/)).toBeTruthy();
  });
});

test('vicino a me: risultati solo dopo la nuova lettura della posizione, anche alla riapertura', async () => {
  useColorScheme.mockReturnValue('light');
  const Location = require('expo-location');
  Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  let resolveGps;
  Location.getCurrentPositionAsync.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveGps = resolve;
      }),
  );
  // un punto dell'ailanto come posizione: almeno una segnalazione entro il raggio
  const [lon, lat] = ailanto.load().punti[0];
  const coords = { coords: { latitude: lat, longitude: lon, accuracy: 5 } };
  const props = {
    speciesList: [ailanto],
    manifest: null,
    filters: { ...DEFAULT_FILTERS, includeAutomatic: true },
    onSelect: noop,
    onInfo: noop,
    onClose: noop,
  };

  const { rerender } = await render(<NearbyPanel visible {...props} />);
  expect(await screen.findByText('Aggiornamento della posizione…')).toBeTruthy();
  expect(screen.queryByText(/specie entro/)).toBeNull();
  await act(async () => resolveGps(coords));
  expect(await screen.findByText(/specie entro 5 km/)).toBeTruthy();

  // chiusura e riapertura: i risultati precedenti non si mostrano finché il GPS non risponde
  await rerender(<NearbyPanel visible={false} {...props} />);
  await rerender(<NearbyPanel visible {...props} />);
  expect(await screen.findByText('Aggiornamento della posizione…')).toBeTruthy();
  expect(screen.queryByText(/specie entro/)).toBeNull();
  await act(async () => resolveGps(coords));
  expect(await screen.findByText(/specie entro 5 km/)).toBeTruthy();
});

test('presentazione: pulsanti e swipe restano sincronizzati', async () => {
  useColorScheme.mockReturnValue('light');
  const onDone = jest.fn();
  await render(<WelcomeScreen visible onDone={onDone} />);
  expect(screen.getByText('Avanti')).toBeTruthy();
  expect(screen.queryByText('Indietro')).toBeNull();
  await fireEvent.press(screen.getByText('Avanti'));
  expect(screen.getByText('Indietro')).toBeTruthy();
  // swipe fino all'ultima pagina
  const pager = screen.getByTestId('welcome-pager');
  await fireEvent(pager, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 10000, y: 0 } } });
  expect(screen.getByText('Inizia')).toBeTruthy();
  expect(screen.queryByText('Salta')).toBeNull();
  // swipe indietro alla prima
  await fireEvent(pager, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
  expect(screen.getByText('Salta')).toBeTruthy();
  await fireEvent.press(screen.getByText('Salta'));
  expect(onDone).toHaveBeenCalled();
});

test('filtri: periodo relativo e dall’anno si escludono a vicenda', async () => {
  useColorScheme.mockReturnValue('light');
  const onChange = jest.fn();
  const props = { visible: true, showGrid: false, onToggleGrid: noop, gridNote: '', onClose: noop, onChange };
  const { rerender } = await render(<FiltersPanel {...props} filters={{ ...DEFAULT_FILTERS, minYear: 2010 }} />);
  await fireEvent.press(screen.getByText('Ultimo mese'));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, minYear: null, maxAgeDays: 30 });
  await rerender(<FiltersPanel {...props} filters={{ ...DEFAULT_FILTERS, maxAgeDays: 30 }} />);
  expect(screen.getByText(/escluse le segnalazioni senza data completa/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Dal 2020'));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, minYear: 2020, maxAgeDays: null });
  // "Ultimi 5 anni" è relativo a oggi, non un anno fisso
  await fireEvent.press(screen.getByText('Ultimi 5 anni'));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, lastYears: 5 });
  await rerender(<FiltersPanel {...props} filters={{ ...DEFAULT_FILTERS, lastYears: 5 }} />);
  expect(screen.getByText(/a oggi, in base alla data dell’osservazione/)).toBeTruthy();
  await rerender(<FiltersPanel {...props} filters={{ ...DEFAULT_FILTERS, minYear: 2020 }} />);
  expect(screen.getByText(/Dal 1° gennaio 2020/)).toBeTruthy();
});
