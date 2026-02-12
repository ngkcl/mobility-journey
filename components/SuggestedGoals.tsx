/**
 * SuggestedGoals.tsx — "Suggested for you" section on goals dashboard (GL-007)
 *
 * Shows AI-powered goal suggestions based on user metrics.
 * One-tap to create a suggested goal (pre-filled).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, radii } from '@/lib/theme';
import {
  suggestGoals,
  suggestionToGoalInput,
  type GoalSuggestion,
} from '@/lib/goalSuggestions';
import { createGoal } from '@/lib/goals';

interface SuggestedGoalsProps {
  /** Called after a suggestion is accepted and a goal is created */
  onGoalCreated?: () => void;
}

export default function SuggestedGoals({ onGoalCreated }: SuggestedGoalsProps) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<GoalSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null); // type being created
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      const results = await suggestGoals();
      setSuggestions(results);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const handleAcceptSuggestion = useCallback(
    async (suggestion: GoalSuggestion) => {
      setCreating(suggestion.type);
      try {
        const input = suggestionToGoalInput(suggestion);
        const goal = await createGoal(input);
        if (goal) {
          onGoalCreated?.();
          // Remove this suggestion
          setSuggestions((prev) => prev.filter((s) => s.type !== suggestion.type));
        } else {
          Alert.alert('Error', 'Failed to create goal. Please try again.');
        }
      } catch (err) {
        console.error('Failed to create goal from suggestion:', err);
        Alert.alert('Error', 'Something went wrong. Please try again.');
      } finally {
        setCreating(null);
      }
    },
    [onGoalCreated],
  );

  const handleDismiss = useCallback((type: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(type);
      return next;
    });
  }, []);

  const handleCustomize = useCallback(
    (suggestion: GoalSuggestion) => {
      // Navigate to goal creation wizard with pre-filled values
      router.push({
        pathname: '/goals/new',
        params: {
          prefillType: suggestion.type,
          prefillTarget: String(suggestion.targetValue),
          prefillStarting: String(suggestion.startingValue),
          prefillWeeks: String(suggestion.deadlineWeeks),
        },
      });
    },
    [router],
  );

  // Filter out dismissed
  const visibleSuggestions = suggestions.filter((s) => !dismissed.has(s.type));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.tealLight} />
      </View>
    );
  }

  if (visibleSuggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="bulb-outline" size={18} color={colors.warning} />
        <Text style={styles.headerText}>Suggested for you</Text>
      </View>

      {visibleSuggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.type}
          suggestion={suggestion}
          creating={creating === suggestion.type}
          onAccept={() => handleAcceptSuggestion(suggestion)}
          onCustomize={() => handleCustomize(suggestion)}
          onDismiss={() => handleDismiss(suggestion.type)}
        />
      ))}
    </View>
  );
}

// ── Suggestion Card ─────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: GoalSuggestion;
  creating: boolean;
  onAccept: () => void;
  onCustomize: () => void;
  onDismiss: () => void;
}

function SuggestionCard({
  suggestion,
  creating,
  onAccept,
  onCustomize,
  onDismiss,
}: SuggestionCardProps) {
  const iconColor = getIconColor(suggestion.type);

  return (
    <View style={styles.card}>
      {/* Dismiss button */}
      <Pressable
        style={styles.dismissButton}
        onPress={onDismiss}
        hitSlop={8}
      >
        <Ionicons name="close" size={16} color={colors.textTertiary} />
      </Pressable>

      {/* Icon + Title */}
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: `${iconColor}20` }]}>
          <Ionicons
            name={suggestion.icon as keyof typeof Ionicons.glyphMap}
            size={20}
            color={iconColor}
          />
        </View>
        <View style={styles.cardTitleArea}>
          <Text style={styles.cardTitle}>{suggestion.title}</Text>
          <Text style={styles.cardDescription} numberOfLines={2}>
            {suggestion.reason}
          </Text>
        </View>
      </View>

      {/* Target info */}
      <View style={styles.targetRow}>
        <View style={styles.targetPill}>
          <Text style={styles.targetLabel}>
            {suggestion.startingValue} → {suggestion.targetValue}
          </Text>
        </View>
        <Text style={styles.timeframe}>
          {suggestion.deadlineWeeks} weeks
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={styles.acceptButton}
          onPress={onAccept}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text style={styles.acceptText}>Start this goal</Text>
            </>
          )}
        </Pressable>
        <Pressable style={styles.customizeButton} onPress={onCustomize}>
          <Text style={styles.customizeText}>Customize</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getIconColor(type: string): string {
  switch (type) {
    case 'pain_reduction':
      return colors.pain ?? '#ef4444';
    case 'symmetry_improvement':
      return colors.symmetry ?? '#8b5cf6';
    case 'posture_score':
      return colors.posture ?? '#14b8a6';
    case 'workout_consistency':
      return colors.info ?? '#3b82f6';
    case 'workout_streak':
      return colors.warning ?? '#f59e0b';
    default:
      return colors.tealLight ?? '#5eead4';
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  loadingContainer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  headerText: {
    ...typography.captionMedium,
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.bgElevated ?? colors.bgBase,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight ?? colors.border,
    position: 'relative',
  },
  dismissButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1,
    padding: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingRight: spacing.lg, // space for dismiss button
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleArea: {
    flex: 1,
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  cardDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  targetPill: {
    backgroundColor: `${colors.teal}15`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  targetLabel: {
    ...typography.captionMedium,
    color: colors.teal ?? colors.tealLight,
  },
  timeframe: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.teal ?? colors.tealLight,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  acceptText: {
    ...typography.captionMedium,
    color: '#fff',
  },
  customizeButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customizeText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
  },
});
