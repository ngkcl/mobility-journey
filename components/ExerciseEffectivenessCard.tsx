/**
 * ExerciseEffectivenessCard
 *
 * Displays a single exercise's pain correlation data — how much it
 * helps or hurts specific body zones based on before/after analysis.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import { tapLight } from '@/lib/haptics';
import type { OverallExerciseEffect, CorrelationConfidence } from '@/lib/correlationEngine';

// ─── Category Colors (matching workouts.tsx) ──────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  corrective: { bg: colors.corrective.bg, text: colors.corrective.text },
  stretching: { bg: colors.stretching.bg, text: colors.stretching.text },
  strengthening: { bg: colors.strengthening.bg, text: colors.strengthening.text },
  warmup: { bg: colors.warmup.bg, text: colors.warmup.text },
  cooldown: { bg: colors.cooldown.bg, text: colors.cooldown.text },
  gym_compound: { bg: colors.gym_compound.bg, text: colors.gym_compound.text },
  gym_isolation: { bg: colors.gym_isolation.bg, text: colors.gym_isolation.text },
  cardio: { bg: colors.cardio.bg, text: colors.cardio.text },
  mobility: { bg: colors.mobility.bg, text: colors.mobility.text },
};

const getEffectColor = (direction: string) => {
  switch (direction) {
    case 'helps':
      return { bg: 'rgba(52,211,153,0.12)', text: '#34d399', icon: 'trending-down' as const };
    case 'hurts':
      return { bg: 'rgba(248,113,113,0.12)', text: '#f87171', icon: 'trending-up' as const };
    default:
      return { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8', icon: 'remove' as const };
  }
};

const renderConfidence = (confidence: CorrelationConfidence) => {
  const dots = confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
  const color = confidence === 'high' ? '#34d399' : confidence === 'medium' ? '#fbbf24' : '#94a3b8';
  return (
    <View style={s.confidenceRow}>
      {Array.from({ length: 3 }).map((_, i) => (
        <View
          key={i}
          style={[
            s.confidenceDot,
            { backgroundColor: i < dots ? color : 'rgba(148,163,184,0.2)' },
          ]}
        />
      ))}
      <Text style={[s.confidenceLabel, { color }]}>
        {confidence}
      </Text>
    </View>
  );
};

interface Props {
  effect: OverallExerciseEffect;
  onPress?: () => void;
}

export function ExerciseEffectivenessCard({ effect, onPress }: Props) {
  const catColor = CATEGORY_COLORS[effect.category] ?? { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' };
  const effectStyle = getEffectColor(effect.direction);
  const absDelta = Math.abs(effect.avg_delta_pct);

  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress?.();
      }}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
    >
      {/* Header row */}
      <View style={s.headerRow}>
        <View style={s.titleArea}>
          <Text style={s.exerciseName} numberOfLines={1}>
            {effect.exercise_name}
          </Text>
          <View style={[s.categoryBadge, { backgroundColor: catColor.bg }]}>
            <Text style={[s.categoryText, { color: catColor.text }]}>
              {effect.category.replace('_', ' ')}
            </Text>
          </View>
        </View>
        {renderConfidence(effect.confidence)}
      </View>

      {/* Effect summary */}
      <View style={[s.effectRow, { backgroundColor: effectStyle.bg }]}>
        <Ionicons name={effectStyle.icon} size={18} color={effectStyle.text} />
        <Text style={[s.effectText, { color: effectStyle.text }]}>
          {effect.direction === 'helps'
            ? `↓ ${absDelta}% pain reduction`
            : effect.direction === 'hurts'
              ? `↑ ${absDelta}% pain increase`
              : `~ Neutral effect`}
        </Text>
        <Text style={s.occurrences}>
          {effect.occurrences} sessions
        </Text>
      </View>

      {/* Affected zones */}
      {effect.affected_zones.length > 0 && (
        <View style={s.zonesRow}>
          {effect.affected_zones.slice(0, 4).map((zone) => {
            const zDelta = Math.abs(zone.delta_pct);
            const isHelp = zone.delta_pct < 0;
            return (
              <View key={zone.zone_id} style={s.zoneChip}>
                <View
                  style={[
                    s.zoneDot,
                    { backgroundColor: isHelp ? '#34d399' : '#f87171' },
                  ]}
                />
                <Text style={s.zoneText} numberOfLines={1}>
                  {zone.zone_name}
                </Text>
                <Text style={[s.zoneDelta, { color: isHelp ? '#34d399' : '#f87171' }]}>
                  {isHelp ? '↓' : '↑'}{zDelta}%
                </Text>
              </View>
            );
          })}
          {effect.affected_zones.length > 4 && (
            <Text style={s.moreZones}>
              +{effect.affected_zones.length - 4} more
            </Text>
          )}
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  titleArea: {
    flex: 1,
    marginRight: spacing.sm,
  },
  exerciseName: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confidenceLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 3,
    textTransform: 'capitalize',
  },
  effectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  effectText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  occurrences: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  zonesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(148,163,184,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    gap: 4,
  },
  zoneDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  zoneText: {
    fontSize: 11,
    color: colors.textSecondary,
    maxWidth: 80,
  },
  zoneDelta: {
    fontSize: 10,
    fontWeight: '600',
  },
  moreZones: {
    fontSize: 11,
    color: colors.textTertiary,
    alignSelf: 'center',
    marginLeft: 2,
  },
});
