import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { speciesOfRecords } from '../data/points';

/**
 * Scheda con anno e fonte delle segnalazioni selezionate.
 * `points` contiene una sola segnalazione oppure tutte quelle che cadono nello stesso
 * punto (record con coordinate identiche, che nessuno zoom può separare), anche di specie
 * diverse quando la mappa mostra tutte le specie. Ogni record porta con sé la sua specie.
 */
export default function PointCard({ points, coordinate, onClose, onOpenSheet, onLayout, bottomInset }) {
  if (!points?.length) return null;
  const multiple = points.length > 1;
  const speciesHere = speciesOfRecords(points);
  const species = speciesHere.length === 1 ? speciesHere[0] : null;
  return (
    <View style={[styles.card, { bottom: bottomInset + 84 }]} onLayout={(e) => onLayout?.(e.nativeEvent.layout)}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {species ? species.commonName : `${speciesHere.length} specie in questo punto`}
        </Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Chiudi scheda">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      {species && (
        <View style={styles.subheader}>
          <Text style={styles.scientific}>{species.scientificName}</Text>
          {onOpenSheet && (
            <Pressable onPress={() => onOpenSheet(species.slug)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.sheetLink}>Scheda della specie ›</Text>
            </Pressable>
          )}
        </View>
      )}

      {coordinate && (
        <>
          <Text style={styles.label}>Coordinate</Text>
          <Text style={styles.value} selectable>
            {formatCoordinate(coordinate)}
          </Text>
        </>
      )}

      {multiple ? (
        <>
          <Text style={styles.label}>{points.length} segnalazioni in questo punto</Text>
          <FlatList
            style={styles.list}
            data={points}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item }) => (
              <View style={styles.listRow}>
                <Text style={styles.listYear}>{item.year ?? 'n.d.'}</Text>
                <View style={styles.listText}>
                  {!species && (
                    <Pressable onPress={() => onOpenSheet?.(item.species.slug)} hitSlop={4}>
                      <Text style={styles.listSpecies}>{item.species.commonName} ›</Text>
                    </Pressable>
                  )}
                  <Text style={styles.listSource} numberOfLines={2}>
                    {item.source}
                    {item.automatic ? '  (automatica)' : ''}
                  </Text>
                  {(item.uncertainty != null || item.license) && (
                    <Text style={styles.listMeta}>
                      {[
                        item.uncertainty != null ? `Incertezza ${formatUncertainty(item.uncertainty)}` : null,
                        item.license ? `Licenza ${item.license}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  )}
                </View>
              </View>
            )}
          />
        </>
      ) : (
        <SinglePoint point={points[0]} />
      )}
    </View>
  );
}

/** "41.89012° N, 12.49231° E". La precisione reale è indicata a parte (incertezza). */
function formatCoordinate({ latitude, longitude }) {
  const lat = `${Math.abs(latitude).toFixed(5)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(5)}° ${longitude >= 0 ? 'E' : 'O'}`;
  return `${lat}, ${lon}`;
}

/** Raggio di incertezza della posizione dichiarato dalla fonte: "± 12 m", "± 1,5 km". */
function formatUncertainty(meters) {
  if (meters < 1000) return `± ${Math.max(1, Math.round(meters))} m`;
  const km = meters / 1000;
  return `± ${km.toLocaleString('it-IT', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

function SinglePoint({ point }) {
  return (
    <>
      <Text style={styles.label}>Incertezza della posizione</Text>
      <Text style={styles.value}>
        {point.uncertainty != null ? formatUncertainty(point.uncertainty) : 'Non indicata dalla fonte'}
      </Text>
      <Text style={styles.label}>{"Anno dell'avvistamento"}</Text>
      <Text style={styles.value}>{point.year ?? 'Non indicato'}</Text>
      <Text style={styles.label}>Fonte del dato</Text>
      <Text style={styles.value}>{point.source}</Text>
      <Text style={styles.label}>Licenza</Text>
      <Text style={styles.value}>{point.license ?? 'Non indicata'}</Text>
      {point.automatic && (
        <Text style={styles.warning}>Identificazione solo automatica (non verificata da un esperto)</Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  close: { fontSize: 18, color: '#666', paddingLeft: 12 },
  subheader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  scientific: { flex: 1, fontSize: 13, fontStyle: 'italic', color: '#555' },
  sheetLink: { fontSize: 13, color: '#1565c0', fontWeight: '600', paddingLeft: 8 },
  label: { fontSize: 12, color: '#777', marginTop: 6 },
  value: { fontSize: 15, color: '#1b1b1b' },
  warning: { marginTop: 8, fontSize: 12, color: '#b26a00' },
  list: { maxHeight: 180, marginTop: 6 },
  listRow: { flexDirection: 'row', paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#e0e0e0' },
  listYear: { width: 48, fontSize: 14, fontWeight: '600', color: '#1b1b1b' },
  listText: { flex: 1 },
  listSpecies: { fontSize: 13, fontWeight: '700', color: '#1565c0' },
  listSource: { fontSize: 13, color: '#333' },
  listMeta: { fontSize: 12, color: '#777', marginTop: 1 },
});
