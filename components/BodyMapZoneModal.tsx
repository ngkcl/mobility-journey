/**
 * BodyMapZoneModal — Modal for logging or viewing zone pain/tension data.
 *
 * Shows sensation picker, intensity slider, optional notes,
 * and a mini sparkline of recent history for the selected zone.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { tapLight, tapMedium, selectionTick } from '../lib/haptics';
import {
  SENSATIONS,
  intensityToSolidColor,
  getZoneHistory,
  saveBodyMapEntry,
  deleteBodyMapEntry,
  type BodyZoneId,
  type BodyMapEntry,
  type SensationType,
} from '../lib/bodyMap';
import { colors, typography, spacing, radii } from '@/lib/theme';

// ─── Mini Sparkline ──────────────────────────────────────────────────────────

function Sparkline({ history }: { history: BodyMapEntry[] }) {
  if (history.length < 2) return null;

  const w = 200;
  const h = 40;
  const padding = 4;
  const max = 10;
  const step = (w - padding * 2) / (history.length - 1);

  const points = history
    .map((e, i) => {
      const x = padding + i * step;
      const y = h - padding - ((e.intensity / max) * (h - padding * 2));
      return `${x},${y}`;
    })
    .join(' ');

  const lastEntry = history[history.length - 1];
  const lastX = padding + (history.length - 1) * step;
  const lastY = h - padding - ((lastEntry.intensity / max) * (h - padding * 2));

  return (
    <View style={sparkStyles.container}>
      <Text style={sparkStyles.label}>Last {history.length} entries</Text>
      <Svg width={w} height={h}>
        <Polyline
          points={points}
          fill="none"
          stroke={intensityToSolidColor(lastEntry.intensity)}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle
          cx={lastX}
          cy={lastY}
          r={3}
          fill={intensityToSolidColor(lastEntry.intensity)}
        />
      </Svg>
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  label: {
    ...typography.tiny,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
});

// ─── Intensity Slider (stepped) ──────────────────────────────────────────────

function IntensityPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.labelRow}>
        <Text style={sliderStyles.label}>Intensity</Text>
        <View style={[sliderStyles.valueBadge, { backgroundColor: intensityToSolidColor(value) + '25', borderColor: intensityToSolidColor(value) + '50' }]}>
          <Text style={[sliderStyles.valueText, { color: intensityToSolidColor(value) }]}>{value}/10</Text>
        </View>
      </View>
      <View style={sliderStyles.track}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            onPress={() => {
              selectionTick();
              onChange(n);
            }}
            style={[
              sliderStyles.step,
              {
                backgroundColor:
                  n <= value ? intensityToSolidColor(n) + '80' : colors.bgCard,
                borderColor:
                  n <= value ? intensityToSolidColor(n) + '60' : colors.border,
              },
            ]}
          >
            <Text
              style={[
                sliderStyles.stepText,
                { color: n <= value ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
  valueBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  valueText: {
    ...typography.tiny,
    fontWeight: '700',
  },
  track: {
    flexDirection: 'row',
    gap: 4,
  },
  step: {
    flex: 1,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stepText: {
    ...typography.small,
    fontWeight: '600',
  },
});

// ─── Main Modal ──────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  zoneId: BodyZoneId | null;
  zoneLabel: string;
  currentEntry: BodyMapEntry | null;
  onSave: (entry: Omit<BodyMapEntry, 'id'>) => void;
  onClear: (entryId: string) => void;
  onClose: () => void;
};

export default function BodyMapZoneModal({
  visible,
  zoneId,
  zoneLabel,
  currentEntry,
  onSave,
  onClear,
  onClose,
}: Props) {
  const [sensation, setSensation] = useState<SensationType>(currentEntry?.sensation ?? 'pain');
  const [intensity, setIntensity] = useState(currentEntry?.intensity ?? 5);
  const [notes, setNotes] = useState(currentEntry?.notes ?? '');
  const [history, setHistory] = useState<BodyMapEntry[]>([]);

  // Reset form when zone changes
  useEffect(() => {
    if (visible && zoneId) {
      setSensation(currentEntry?.sensation ?? 'pain');
      setIntensity(currentEntry?.intensity ?? 5);
      setNotes(currentEntry?.notes ?? '');
      getZoneHistory(zoneId, 14).then(setHistory);
    }
  }, [visible, zoneId, currentEntry]);

  const handleSave = () => {
    if (!zoneId) return;
    tapMedium();
    onSave({
      zone: zoneId,
      intensity,
      sensation,
      notes: notes.trim() || null,
      recorded_at: new Date().toISOString(),
    });
  };

  const handleClear = () => {
    if (currentEntry?.id) {
      tapLight();
      onClear(currentEntry.id);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.zoneLabel}>{zoneLabel}</Text>
                <Text style={styles.zoneSub}>
                  {currentEntry ? 'Update entry' : 'Log sensation'}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            {/* Sensation Picker */}
            <Text style={styles.sectionLabel}>Sensation</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {SENSATIONS.map((s) => {
                const active = sensation === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => {
                      selectionTick();
                      setSensation(s.id);
                    }}
                    style={[
                      styles.pill,
                      active && styles.pillActive,
                    ]}
                  >
                    <Ionicons
                      name={s.icon as any}
                      size={16}
                      color={active ? colors.teal : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.pillText,
                        active && styles.pillTextActive,
                      ]}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Intensity */}
            <IntensityPicker value={intensity} onChange={setIntensity} />

            {/* Notes */}
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>
              Notes <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add details about this sensation..."
              placeholderTextColor={colors.textPlaceholder}
              multiline
              maxLength={200}
            />

            {/* History Sparkline */}
            {history.length >= 2 && <Sparkline history={history} />}

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {currentEntry ? 'Update' : 'Save'}
                </Text>
              </Pressable>

              {currentEntry && (
                <Pressable
                  onPress={handleClear}
                  style={({ pressed }) => [
                    styles.clearBtn,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={styles.clearBtnText}>Clear</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const { height: screenHeight } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgBase,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
    maxHeight: screenHeight * 0.78,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  zoneLabel: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  zoneSub: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  optional: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '400',
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.tealBorder,
  },
  pillText: {
    ...typography.captionMedium,
    color: colors.textMuted,
  },
  pillTextActive: {
    color: colors.teal,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.teal,
    borderRadius: radii.lg,
    paddingVertical: spacing.md + 2,
  },
  saveBtnText: {
    ...typography.bodySemibold,
    color: '#ffffff',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radii.lg,
    backgroundColor: colors.errorDim,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  clearBtnText: {
    ...typography.captionMedium,
    color: colors.error,
  },
});
