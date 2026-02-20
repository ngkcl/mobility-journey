/**
 * Body Map — Interactive pain & tension visualization screen.
 *
 * Tap anatomical zones to log sensation type, intensity, and notes.
 * Includes asymmetry alerts and recent entry list.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ErrorBoundary from '../../components/ErrorBoundary';
import BodyMap from '../../components/BodyMap';
import BodyMapZoneModal from '../../components/BodyMapZoneModal';
import { tapLight } from '../../lib/haptics';
import {
  BODY_ZONES_FRONT,
  BODY_ZONES_BACK,
  SENSATIONS,
  getBodyMapEntries,
  getLatestEntryPerZone,
  getAsymmetryReport,
  saveBodyMapEntry,
  deleteBodyMapEntry,
  intensityToSolidColor,
  type BodyZoneId,
  type BodyMapEntry,
} from '../../lib/bodyMap';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';

// ─── Date Range Helpers ──────────────────────────────────────────────────────

type DateRange = 'today' | 'yesterday' | 'week';

function getDateRange(range: DateRange): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (range) {
    case 'yesterday':
      from.setDate(from.getDate() - 1);
      to.setDate(to.getDate() - 1);
      to.setHours(23, 59, 59, 999);
      break;
    case 'week':
      from.setDate(from.getDate() - 6);
      break;
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

const DATE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
];

// ─── Zone label lookup ───────────────────────────────────────────────────────

const ALL_ZONES = [...BODY_ZONES_FRONT, ...BODY_ZONES_BACK];
function getZoneLabel(id: BodyZoneId): string {
  return ALL_ZONES.find((z) => z.id === id)?.label ?? id;
}

function getSensationIcon(s: string): string {
  return SENSATIONS.find((x) => x.id === s)?.icon ?? 'ellipse';
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BodyMapScreen() {
  const [view, setView] = useState<'front' | 'back'>('front');
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [entries, setEntries] = useState<Record<string, BodyMapEntry | null>>({});
  const [allEntries, setAllEntries] = useState<BodyMapEntry[]>([]);
  const [asymmetry, setAsymmetry] = useState<
    { zone_pair: string; left: number; right: number; diff: number }[]
  >([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedZone, setSelectedZone] = useState<BodyZoneId | null>(null);

  const loadData = useCallback(async () => {
    const { from, to } = getDateRange(dateRange);
    const [entriesData, latestData, asymData] = await Promise.all([
      getBodyMapEntries(from, to),
      getLatestEntryPerZone(),
      getAsymmetryReport(),
    ]);

    setAllEntries(entriesData);
    setEntries(latestData);
    setAsymmetry(asymData.filter((a) => a.diff >= 3));
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleZoneTap = (zoneId: BodyZoneId) => {
    setSelectedZone(zoneId);
    setModalVisible(true);
  };

  const handleSave = async (entry: Omit<BodyMapEntry, 'id'>) => {
    await saveBodyMapEntry(entry);
    setModalVisible(false);
    await loadData();
  };

  const handleClear = async (entryId: string) => {
    await deleteBodyMapEntry(entryId);
    setModalVisible(false);
    await loadData();
  };

  const selectedZoneLabel = selectedZone ? getZoneLabel(selectedZone) : '';
  const selectedEntry = selectedZone ? entries[selectedZone] ?? null : null;

  const activeCount = Object.values(entries).filter(Boolean).length;

  return (
    <ErrorBoundary screenName="Body Map">
      <View style={shared.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.teal}
            />
          }
        >
          {/* Date Selector */}
          <View style={styles.dateRow}>
            {DATE_OPTIONS.map((opt) => {
              const active = dateRange === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    tapLight();
                    setDateRange(opt.key);
                  }}
                  style={[styles.datePill, active && styles.datePillActive]}
                >
                  <Text
                    style={[styles.datePillText, active && styles.datePillTextActive]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* View Toggle */}
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => {
                tapLight();
                setView('front');
              }}
              style={[styles.toggleBtn, view === 'front' && styles.toggleActive]}
            >
              <Ionicons
                name="body-outline"
                size={16}
                color={view === 'front' ? colors.teal : colors.textMuted}
              />
              <Text
                style={[
                  styles.toggleText,
                  view === 'front' && styles.toggleTextActive,
                ]}
              >
                Front
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                tapLight();
                setView('back');
              }}
              style={[styles.toggleBtn, view === 'back' && styles.toggleActive]}
            >
              <Ionicons
                name="body-outline"
                size={16}
                color={view === 'back' ? colors.teal : colors.textMuted}
              />
              <Text
                style={[
                  styles.toggleText,
                  view === 'back' && styles.toggleTextActive,
                ]}
              >
                Back
              </Text>
            </Pressable>
          </View>

          {/* Body Map */}
          <View style={styles.mapContainer}>
            <BodyMap
              view={view}
              entries={entries}
              onZoneTap={handleZoneTap}
            />
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.legendText}>Low</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={styles.legendText}>Medium</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.legendText}>High</Text>
            </View>
          </View>

          {/* Asymmetry Alerts */}
          {asymmetry.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Ionicons name="warning" size={16} color={colors.warning} />
                </View>
                <Text style={styles.sectionTitle}>Asymmetry Alerts</Text>
              </View>
              {asymmetry.map((a) => (
                <View key={a.zone_pair} style={styles.asymCard}>
                  <View style={styles.asymHeader}>
                    <Text style={styles.asymLabel}>{a.zone_pair}</Text>
                    <View style={[styles.asymBadge, { backgroundColor: colors.warningDim, borderColor: colors.warning + '40' }]}>
                      <Text style={[styles.asymBadgeText, { color: colors.warning }]}>
                        {a.diff}pt diff
                      </Text>
                    </View>
                  </View>
                  <View style={styles.asymRow}>
                    <View style={styles.asymSide}>
                      <View style={[styles.asymDot, { backgroundColor: colors.leftSide }]} />
                      <Text style={styles.asymSideText}>Left: {a.left}</Text>
                    </View>
                    <View style={styles.asymBar}>
                      <View
                        style={[
                          styles.asymBarFill,
                          {
                            width: `${(a.left / 10) * 100}%`,
                            backgroundColor: colors.leftSide,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <View style={styles.asymRow}>
                    <View style={styles.asymSide}>
                      <View style={[styles.asymDot, { backgroundColor: colors.rightSide }]} />
                      <Text style={styles.asymSideText}>Right: {a.right}</Text>
                    </View>
                    <View style={styles.asymBar}>
                      <View
                        style={[
                          styles.asymBarFill,
                          {
                            width: `${(a.right / 10) * 100}%`,
                            backgroundColor: colors.rightSide,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Recent Entries */}
          {allEntries.length > 0 && (
            <View style={styles.section}>
              <Pressable
                onPress={() => {
                  tapLight();
                  setShowHistory(!showHistory);
                }}
                style={styles.sectionHeader}
              >
                <View style={styles.sectionIcon}>
                  <Ionicons name="list" size={16} color={colors.teal} />
                </View>
                <Text style={[styles.sectionTitle, { flex: 1 }]}>
                  Recent Entries
                </Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{allEntries.length}</Text>
                </View>
                <Ionicons
                  name={showHistory ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textMuted}
                />
              </Pressable>

              {showHistory &&
                allEntries.slice(0, 15).map((entry) => (
                  <View key={entry.id} style={styles.entryRow}>
                    <View
                      style={[
                        styles.entryIcon,
                        {
                          backgroundColor: intensityToSolidColor(entry.intensity) + '20',
                          borderColor: intensityToSolidColor(entry.intensity) + '40',
                        },
                      ]}
                    >
                      <Ionicons
                        name={getSensationIcon(entry.sensation) as any}
                        size={14}
                        color={intensityToSolidColor(entry.intensity)}
                      />
                    </View>
                    <View style={styles.entryContent}>
                      <Text style={styles.entryZone}>{getZoneLabel(entry.zone)}</Text>
                      <Text style={styles.entryMeta}>
                        {entry.sensation} · {entry.intensity}/10
                        {entry.notes ? ` · ${entry.notes}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.entryTime}>
                      {new Date(entry.recorded_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                ))}
            </View>
          )}

          {/* Empty State */}
          {allEntries.length === 0 && activeCount === 0 && (
            <View style={shared.emptyState}>
              <Ionicons name="body-outline" size={48} color={colors.textMuted} />
              <Text style={shared.emptyStateTitle}>No entries yet</Text>
              <Text style={shared.emptyStateText}>
                Tap any zone on the body map above to log pain, tension, or discomfort.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Zone Modal */}
        <BodyMapZoneModal
          visible={modalVisible}
          zoneId={selectedZone}
          zoneLabel={selectedZoneLabel}
          currentEntry={selectedEntry}
          onSave={handleSave}
          onClear={handleClear}
          onClose={() => setModalVisible(false)}
        />
      </View>
    </ErrorBoundary>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingBottom: 120,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  datePill: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePillActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.tealBorder,
  },
  datePillText: {
    ...typography.captionMedium,
    color: colors.textMuted,
  },
  datePillTextActive: {
    color: colors.teal,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: 3,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
  },
  toggleActive: {
    backgroundColor: colors.tealDim,
  },
  toggleText: {
    ...typography.captionMedium,
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.teal,
  },
  mapContainer: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    ...typography.tiny,
    color: colors.textTertiary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  countBadge: {
    backgroundColor: colors.tealDim,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  countBadgeText: {
    ...typography.tiny,
    color: colors.tealLight,
    fontWeight: '600',
  },
  // Asymmetry
  asymCard: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.lg,
    padding: spacing.md + 2,
    borderWidth: 1,
    borderColor: colors.warning + '30',
    marginBottom: spacing.sm,
  },
  asymHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  asymLabel: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  asymBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  asymBadgeText: {
    ...typography.tiny,
    fontWeight: '700',
  },
  asymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  asymSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 70,
  },
  asymDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  asymSideText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  asymBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgCard,
    overflow: 'hidden',
  },
  asymBarFill: {
    height: '100%',
    borderRadius: 3,
    opacity: 0.7,
  },
  // Entries list
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  entryIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  entryContent: {
    flex: 1,
    gap: 2,
  },
  entryZone: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  entryMeta: {
    ...typography.tiny,
    color: colors.textTertiary,
  },
  entryTime: {
    ...typography.tiny,
    color: colors.textMuted,
  },
});
