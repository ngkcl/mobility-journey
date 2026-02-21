/**
 * ZoneEffectivenessCard
 *
 * Shows a specific body zone with its top helpful and harmful exercises.
 * Used in the Exercise Effectiveness section of the analysis screen.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radii } from '@/lib/theme';
import { tapLight } from '@/lib/haptics';
import type { ExerciseCorrelation } from '@/lib/correlationEngine';

interface Props {
  zoneName: string;
  zoneId: string;
  helpful: ExerciseCorrelation[];
  harmful: ExerciseCorrelation[];
  onPress?: () => void;
}

export function ZoneEffectivenessCard({
  zoneName,
  zoneId,
  helpful,
  harmful,
  onPress,
}: Props) {
  const hasData = helpful.length > 0 || harmful.length > 0;

  if (!hasData) return null;

  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress?.();
      }}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
    >
      {/* Zone header */}
      <View style={s.header}>
        <Ionicons name="body-outline" size={18} color={colors.tealLight} />
        <Text style={s.zoneName}>{zoneName}</Text>
      </View>

      {/* Helpful exercises */}
      {helpful.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Ionicons name="checkmark-circle" size={14} color="#34d399" />
            <Text style={s.sectionLabel}>Best exercises</Text>
          </View>
          {helpful.slice(0, 3).map((c) => (
            <View key={c.exercise_id} style={s.exerciseRow}>
              <Text style={s.exerciseName} numberOfLines={1}>
                {c.exercise_name}
              </Text>
              <Text style={[s.delta, { color: '#34d399' }]}>
                ↓ {Math.abs(c.delta_pct)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Harmful exercises */}
      {harmful.length > 0 && (
        <View style={[s.section, { marginTop: helpful.length > 0 ? spacing.xs : 0 }]}>
          <View style={s.sectionHeader}>
            <Ionicons name="warning" size={14} color="#f87171" />
            <Text style={[s.sectionLabel, { color: '#f87171' }]}>Watch out</Text>
          </View>
          {harmful.slice(0, 1).map((c) => (
            <View key={c.exercise_id} style={s.exerciseRow}>
              <Text style={s.exerciseName} numberOfLines={1}>
                {c.exercise_name}
              </Text>
              <Text style={[s.delta, { color: '#f87171' }]}>
                ↑ {Math.abs(c.delta_pct)}%
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 200,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  zoneName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  section: {
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34d399',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 18,
    paddingVertical: 2,
  },
  exerciseName: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.xs,
  },
  delta: {
    fontSize: 12,
    fontWeight: '600',
  },
});
