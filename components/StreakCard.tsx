import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import type { WorkoutHistoryItem } from '@/lib/workoutAnalytics';
import {
  computeStreakStats,
  buildCalendarHeatMap,
  getStreakMessage,
  type StreakStats,
  type CalendarHeatMapMonth,
} from '@/lib/workoutAnalytics';

interface StreakCardProps {
  workoutHistory: WorkoutHistoryItem[];
  onPressWorkout?: () => void;
}

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function StreakCard({ workoutHistory, onPressWorkout }: StreakCardProps) {
  const streakStats = useMemo(() => computeStreakStats(workoutHistory), [workoutHistory]);
  const heatMapData = useMemo(() => buildCalendarHeatMap(workoutHistory, 2), [workoutHistory]);
  const message = useMemo(() => getStreakMessage(streakStats), [streakStats]);

  return (
    <View style={[shared.card, styles.container]}>
      {/* Header with emoji and message */}
      <View style={styles.header}>
        <Text style={styles.emoji}>{message.emoji}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{message.title}</Text>
          <Text style={styles.subtitle}>{message.subtitle}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{streakStats.currentStreak}</Text>
          <Text style={styles.statLabel}>Current</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.bestStreakValue]}>{streakStats.bestStreak}</Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{streakStats.totalWorkoutDays}</Text>
          <Text style={styles.statLabel}>Total Days</Text>
        </View>
      </View>

      {/* Calendar Heat Map */}
      <View style={styles.heatMapContainer}>
        <Text style={styles.heatMapTitle}>Activity</Text>
        {heatMapData.map((monthData) => (
          <CalendarMonth key={monthData.month} data={monthData} />
        ))}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.bgBase }]} />
            <Text style={styles.legendText}>Missed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Workout</Text>
          </View>
        </View>
      </View>

      {/* CTA Button */}
      {streakStats.currentStreak === 0 && onPressWorkout && (
        <Pressable onPress={onPressWorkout} style={styles.ctaButton}>
          <Ionicons name="fitness" size={18} color="#fff" />
          <Text style={styles.ctaText}>Start Workout</Text>
        </Pressable>
      )}
    </View>
  );
}

function CalendarMonth({ data }: { data: CalendarHeatMapMonth }) {
  const monthLabel = format(new Date(data.month + '-01'), 'MMMM yyyy');
  
  // Calculate which day of week the month starts on (0 = Monday in our layout)
  const firstDayOfMonth = new Date(data.month + '-01');
  const startDayOffset = (firstDayOfMonth.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0 system
  
  // Build grid with empty cells for offset
  const gridCells: (typeof data.days[0] | null)[] = [];
  for (let i = 0; i < startDayOffset; i++) {
    gridCells.push(null);
  }
  gridCells.push(...data.days);
  
  // Split into weeks
  const weeks: (typeof gridCells)[] = [];
  for (let i = 0; i < gridCells.length; i += 7) {
    weeks.push(gridCells.slice(i, i + 7));
  }

  return (
    <View style={styles.monthContainer}>
      <Text style={styles.monthLabel}>{monthLabel}</Text>
      
      {/* Weekday headers */}
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <View key={i} style={styles.dayCell}>
            <Text style={styles.weekdayLabel}>{label}</Text>
          </View>
        ))}
      </View>
      
      {/* Calendar grid */}
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((day, dayIndex) => (
            <View key={dayIndex} style={styles.dayCell}>
              {day === null ? (
                <View style={styles.emptyCell} />
              ) : (
                <View
                  style={[
                    styles.dayDot,
                    day.hasWorkout && styles.dayDotActive,
                    day.workoutCount > 1 && styles.dayDotMultiple,
                  ]}
                >
                  {day.hasWorkout && day.workoutCount > 1 && (
                    <Text style={styles.dayDotCount}>{day.workoutCount}</Text>
                  )}
                </View>
              )}
            </View>
          ))}
          {/* Fill remaining cells in incomplete weeks */}
          {week.length < 7 && Array(7 - week.length).fill(null).map((_, i) => (
            <View key={`empty-${i}`} style={styles.dayCell}>
              <View style={styles.emptyCell} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emoji: {
    fontSize: 48,
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: spacing.lg,
    backgroundColor: colors.bgDeep,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.tealLight,
  },
  bestStreakValue: {
    color: colors.warning,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  heatMapContainer: {
    marginBottom: spacing.md,
  },
  heatMapTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  monthContainer: {
    marginBottom: spacing.md,
  },
  monthLabel: {
    ...typography.small,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 36,
    maxHeight: 36,
  },
  weekdayLabel: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  emptyCell: {
    width: 20,
    height: 20,
  },
  dayDot: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: colors.bgBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotActive: {
    backgroundColor: colors.success,
  },
  dayDotMultiple: {
    backgroundColor: colors.teal,
  },
  dayDotCount: {
    ...typography.tiny,
    color: '#fff',
    fontWeight: '700',
    fontSize: 10,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendText: {
    ...typography.tiny,
    color: colors.textTertiary,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.teal,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  ctaText: {
    ...typography.bodySemibold,
    color: '#fff',
  },
});
