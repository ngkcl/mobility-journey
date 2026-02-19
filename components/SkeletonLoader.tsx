import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../lib/theme';

// ─── Shimmer Bone ─────────────────────────────────────────────────────────────

interface BoneProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function Bone({ width, height, borderRadius = radii.sm, style }: BoneProps) {
  const shimmer = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.bgCard,
          opacity: shimmer,
        },
        style,
      ]}
    />
  );
}

// ─── Preset Skeletons ─────────────────────────────────────────────────────────

/** Full-width card skeleton with title + 2 lines + bar */
export function CardSkeleton() {
  return (
    <View style={styles.card}>
      <Bone width="60%" height={16} />
      <View style={{ height: spacing.md }} />
      <Bone width="100%" height={12} />
      <View style={{ height: spacing.sm }} />
      <Bone width="80%" height={12} />
      <View style={{ height: spacing.lg }} />
      <Bone width="100%" height={8} borderRadius={4} />
    </View>
  );
}

/** Stats row: 3 small boxes side by side */
export function StatsRowSkeleton() {
  return (
    <View style={styles.statsRow}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.statBox}>
          <Bone width={40} height={28} borderRadius={radii.sm} />
          <View style={{ height: spacing.xs }} />
          <Bone width={56} height={10} />
        </View>
      ))}
    </View>
  );
}

/** Single list item skeleton */
export function ListItemSkeleton() {
  return (
    <View style={styles.listItem}>
      <Bone width={44} height={44} borderRadius={22} />
      <View style={styles.listItemText}>
        <Bone width="70%" height={14} />
        <View style={{ height: spacing.xs }} />
        <Bone width="45%" height={10} />
      </View>
    </View>
  );
}

/** Full screen loading skeleton for tab screens */
export function ScreenSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <View style={styles.screen}>
      {/* Header area */}
      <View style={styles.header}>
        <Bone width="50%" height={20} />
        <View style={{ height: spacing.sm }} />
        <Bone width="35%" height={12} />
      </View>

      {/* Stats row */}
      <StatsRowSkeleton />

      {/* Cards */}
      {Array.from({ length: cards }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

/** Goal card skeleton */
export function GoalCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.goalHeader}>
        <Bone width={28} height={28} borderRadius={14} />
        <View style={styles.listItemText}>
          <Bone width="65%" height={14} />
          <View style={{ height: spacing.xs }} />
          <Bone width="40%" height={10} />
        </View>
      </View>
      <View style={{ height: spacing.md }} />
      <Bone width="100%" height={8} borderRadius={4} />
      <View style={{ height: spacing.sm }} />
      <View style={styles.goalFooter}>
        <Bone width={60} height={10} />
        <Bone width={80} height={10} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgDeep,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.bgBase,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  listItemText: {
    flex: 1,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  goalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export { Bone };
export default ScreenSkeleton;
