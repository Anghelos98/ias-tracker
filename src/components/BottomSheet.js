import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { useThemedStyles } from '../theme';

// Pannello che sale dal basso (elenco specie, Filtri, Vicino a me).
//
// Si chiude toccando lo sfondo scuro, con il tasto Indietro (Android) o trascinandolo verso il
// basso: il pannello segue il dito e lo sfondo si schiarisce di pari passo; lasciato oltre una
// soglia (o con un gesto rapido) si chiude, altrimenti torna su.
// - Dalla maniglia e dall'intestazione (`header`) si trascina sempre.
// - Dal contenuto si trascina solo quando l'elenco è in cima: altrimenti il gesto scorre
//   l'elenco. Per questo l'elenco riceve le proprietà di useSheetScrollProps().
// Apertura e chiusura sono animate qui (Modal senza animazione propria), così la chiusura
// parte dal punto in cui il dito ha lasciato il pannello.

const OPEN_MS = 260;
const CLOSE_MS = 200;
const DRAG_START_PX = 6; // movimento minimo prima che il trascinamento prenda il gesto
const CLOSE_DISTANCE = 120; // trascinato oltre questa distanza (px) si chiude…
const CLOSE_VELOCITY = 0.8; // …oppure con un gesto rapido verso il basso (px/ms)

const SheetScrollContext = createContext(null);

/** Proprietà da passare alla ScrollView / FlatList del contenuto di un BottomSheet. */
export function useSheetScrollProps() {
  return useContext(SheetScrollContext) ?? {};
}

/** ScrollView del contenuto di un BottomSheet (in cima, il gesto verso il basso chiude il pannello). */
export function SheetScrollView(props) {
  return <ScrollView {...useSheetScrollProps()} {...props} />;
}

/** FlatList del contenuto di un BottomSheet (in cima, il gesto verso il basso chiude il pannello). */
export function SheetFlatList(props) {
  return <FlatList {...useSheetScrollProps()} {...props} />;
}

/** Il gesto è un trascinamento verticale più che orizzontale? */
const isVertical = (g) => Math.abs(g.dy) > DRAG_START_PX && Math.abs(g.dy) > Math.abs(g.dx) * 1.2;

export default function BottomSheet({ visible, onClose, closeLabel, maxHeight, paddingBottom, header, children }) {
  const styles = useThemedStyles(createStyles);
  const { height: screenHeight } = useWindowDimensions();
  const offscreen = screenHeight;
  // Spostamento del pannello verso il basso: 0 = aperto, `offscreen` = fuori dallo schermo.
  const [translateY] = useState(() => new Animated.Value(offscreen));
  // Modal presente: resta montata durante l'animazione di chiusura, poi sparisce.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true); // apertura: stato aggiornato durante il render
  const atTopRef = useRef(true); // elenco del contenuto in cima
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Apertura: la Modal compare e il pannello sale. Chiusura (visible = false, da qualunque
  // parte arrivi): il pannello scende dal punto in cui si trova, poi la Modal sparisce.
  useEffect(() => {
    if (visible) return undefined;
    const animation = Animated.timing(translateY, {
      toValue: offscreen,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setMounted(false); // non se nel frattempo è stato riaperto
    });
    return () => animation.stop();
  }, [visible, offscreen, translateY]);

  useEffect(() => {
    if (!visible || !mounted) return undefined;
    atTopRef.current = true;
    const animation = Animated.timing(translateY, {
      toValue: 0,
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, mounted, translateY]);

  const snapBack = useCallback(() => {
    Animated.spring(translateY, { toValue: 0, bounciness: 4, speed: 18, useNativeDriver: true }).start();
  }, [translateY]);

  const panResponder = useCallback(
    (canStart) =>
      PanResponder.create({
        // fase di cattura: il trascinamento ha la precedenza su righe e pulsanti del pannello
        onMoveShouldSetPanResponderCapture: (_, g) => isVertical(g) && canStart(g),
        onMoveShouldSetPanResponder: (_, g) => isVertical(g) && canStart(g),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => translateY.stopAnimation(),
        onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) onCloseRef.current?.();
          else snapBack();
        },
        onPanResponderTerminate: snapBack,
      }),
    [translateY, snapBack],
  );
  // Dalla maniglia e dall'intestazione: sempre; dal contenuto: verso il basso, a elenco in cima.
  // I ref si leggono solo nelle funzioni chiamate da PanResponder durante il gesto, mai durante
  // il render: la regola del compilatore non può saperlo.
  // eslint-disable-next-line react-hooks/refs
  const headerPan = useMemo(() => panResponder(() => true), [panResponder]);
  // eslint-disable-next-line react-hooks/refs
  const bodyPan = useMemo(() => panResponder((g) => g.dy > 0 && atTopRef.current), [panResponder]);

  const scrollProps = useMemo(
    () => ({
      onScroll: (e) => {
        atTopRef.current = e.nativeEvent.contentOffset.y <= 0;
      },
      scrollEventThrottle: 16,
      bounces: false, // in cima il gesto verso il basso trascina il pannello, non l'elenco
    }),
    [],
  );

  const backdropOpacity = useMemo(
    () => translateY.interpolate({ inputRange: [0, offscreen], outputRange: [1, 0], extrapolate: 'clamp' }),
    [translateY, offscreen],
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents="none" />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <Animated.View style={[styles.sheet, { maxHeight, paddingBottom, transform: [{ translateY }] }]}>
          <View {...headerPan.panHandlers}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
            {header}
          </View>
          <View style={styles.body} {...bodyPan.panHandlers}>
            <SheetScrollContext.Provider value={scrollProps}>{children}</SheetScrollContext.Provider>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (c) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: c.backdrop },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
    },
    // area della maniglia più alta del disegno: più facile da prendere con il dito
    handleArea: { paddingTop: 8, paddingBottom: 12, alignItems: 'center' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.handle },
    body: { flexShrink: 1 },
  });
