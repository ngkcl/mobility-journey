import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { tapLight } from '../lib/haptics';
import { colors, typography, spacing, radii } from '@/lib/theme';
import type { Insight } from '../lib/insightsEngine';

type Props = {
  insight: Insight;
  onDismiss?: (id: string) => void;
};

const priorityGlow: Record<number, number> = {
  1: 0.25,
  2: 0.18,
  3: 0.12,
  4: 0.08,
  5: 0.06,
};

export default function InsightCard({ insight, onDismiss }: Props) {
  const router = useRouter();
  const glowOpacity = priorityGlow[insight.priority] ?? 0.1;

  const handlePress = () => {
    tapLight();
    if (insight.route) {
      router.push(insight.route as any);
    }
  };

  const handleDismiss = () => {
    tapLight();
    onDismiss?.(insight.id);
  };

  return (
    <Pressable
      onPress={insight.route ? handlePress : undefined}
      style={({ pressed }) => [
        styles.card,
        { borderColor: insight.accentColor + '40' },
        pressed && insight.route && styles.pressed,
      ]}
    >
      {/* Glow */}
      <View
        style={[
          styles.glow,
          { backgroundColor: insight.accentColor, opacity: glowOpacity },
        ]}
      />

      <View style={styles.row}>
        {/* Icon */}
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: insight.accentColor + '20', borderColor: insight.accentColor + '30' },
          ]}
        >
          <Ionicons
            name={insight.icon as any}
            size={20}
            color={insight.accentColor}
          />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {insight.title}
          </Text>
          <Text style={styles.body} numberOfLines={3}>
            {insight.body}
          </Text>
        </View>

        {/* Dismiss / Navigate */}
        <View style={styles.actions}>
          {insight.dismissible && onDismiss && (
            <Pressable onPress={handleDismiss} hitSlop={8} style={styles.dismissBtn}>
              <Ionicons name="close" size={14} color={colors.textMuted} />
            </Pressable>
          )}
          {insight.route && (
            <Ionicons
              name="chevron-forward"
              size={14}
              color={colors.textMuted}
              style={styles.chevron}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Horizontal scrollable list of insight cards ────────────────────────────

type InsightListProps = {
  insights: Insight[];
  onDismiss?: (id: string) => void;
};

export function InsightList({ insights, onDismiss }: InsightListProps) {
  if (insights.length === 0) return null;

  return (
    <View style={listStyles.container}>
      <View style={listStyles.header}>
        <View style={listStyles.headerIcon}>
          <Ionicons name="bulb" size={16} color={colors.tealLight} />
        </View>
        <Text style={listStyles.headerTitle}>Smart Insights</Text>
        <View style={listStyles.headerBadge}>
          <Text style={listStyles.headerBadgeText}>{insights.length}</Text>
        </View>
      </View>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.md + 2,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.sm + 2,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  glow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -60,
    right: -30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  body: {
    ...typography.caption,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  actions: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: 2,
  },
  dismissBtn: {
    padding: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.bgCardAlt,
  },
  chevron: {
    marginTop: 4,
  },
});

const listStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  headerBadge: {
    backgroundColor: colors.tealDim,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  headerBadgeText: {
    ...typography.tiny,
    color: colors.tealLight,
    fontWeight: '600',
  },
});
