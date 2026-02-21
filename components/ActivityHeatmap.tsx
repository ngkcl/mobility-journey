/**
 * ActivityHeatmap — GitHub-style contribution calendar for workout consistency.
 *
 * Shows the last 16 weeks of workout activity as a grid of colored squares.
 * Darker teal = more workouts that day. Tapping a day shows a tooltip.
 */
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { colors, typography, spacing, radii } from '@/lib/theme';
import { tapLight } from '@/lib/haptics';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  /** Array of YYYY-MM-DD date strings when workouts occurred */
  workoutDates: string[];
  /** Number of weeks to display (default 16) */
  weeks?: number;
};

type DayCell = {
  date: string; // YYYY-MM-DD
  count: number;
  dayOfWeek: number; // 0=Sun, 6=Sat
  weekIndex: number;
  isToday: boolean;
  isFuture: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['', 'M', '', 'W', '', 'F', ''];
const CELL_GAP = 3;
const CELL_RADIUS = 3;

const INTENSITY_COLORS = [
  colors.bgCard,                    // 0 workouts — empty
  'rgba(20, 184, 166, 0.25)',       // 1 workout — light teal
  'rgba(20, 184, 166, 0.50)',       // 2 workouts — medium teal
  'rgba(20, 184, 166, 0.75)',       // 3 workouts — strong teal
  colors.teal,                      // 4+ workouts — full teal
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// ─── Component ────────────────────────────────────────────────────────────────

export const ActivityHeatmap: React.FC<Props> = ({ workoutDates, weeks = 16 }) => {
  const [selectedDay, setSelectedDay] = useState<DayCell | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Build date count map
  const dateCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of workoutDates) {
      map.set(d, (map.get(d) || 0) + 1);
    }
    return map;
  }, [workoutDates]);

  // Build grid of days (columns = weeks, rows = days of week)
  const { grid, monthLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = formatDateKey(today);

    // End on Saturday of current week
    const endDate = new Date(today);
    const todayDow = endDate.getDay(); // 0=Sun
    endDate.setDate(endDate.getDate() + (6 - todayDow)); // push to Saturday

    // Start on Sunday, `weeks` weeks before endDate
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - weeks * 7 + 1);

    const cells: DayCell[] = [];
    const labels: { label: string; weekIndex: number }[] = [];
    let lastMonth = -1;

    const cursor = new Date(startDate);
    let weekIdx = 0;

    while (cursor <= endDate) {
      const dow = cursor.getDay();
      const key = formatDateKey(cursor);
      const month = cursor.getMonth();

      // Track month transitions for labels
      if (month !== lastMonth && dow <= 1) {
        labels.push({ label: MONTHS_SHORT[month], weekIndex: weekIdx });
        lastMonth = month;
      }

      cells.push({
        date: key,
        count: dateCountMap.get(key) || 0,
        dayOfWeek: dow,
        weekIndex: weekIdx,
        isToday: key === todayKey,
        isFuture: cursor > today,
      });

      // Move to next day
      cursor.setDate(cursor.getDate() + 1);
      if (cursor.getDay() === 0 && cursor <= endDate) weekIdx++;
    }

    return { grid: cells, monthLabels: labels };
  }, [dateCountMap, weeks]);

  // Calculate cell size based on container width
  const totalWeeks = Math.max(1, ...grid.map((c) => c.weekIndex)) + 1;
  const dayLabelWidth = 18;
  const availableWidth = containerWidth - dayLabelWidth - spacing.sm;
  const cellSize = availableWidth > 0
    ? Math.max(8, Math.floor((availableWidth - CELL_GAP * (totalWeeks - 1)) / totalWeeks))
    : 12;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const handleDayPress = useCallback((cell: DayCell) => {
    if (cell.isFuture) return;
    tapLight();
    setSelectedDay((prev) => (prev?.date === cell.date ? null : cell));
  }, []);

  const getIntensityColor = (count: number, isFuture: boolean): string => {
    if (isFuture) return 'rgba(30, 41, 59, 0.3)';
    if (count === 0) return INTENSITY_COLORS[0];
    if (count === 1) return INTENSITY_COLORS[1];
    if (count === 2) return INTENSITY_COLORS[2];
    if (count === 3) return INTENSITY_COLORS[3];
    return INTENSITY_COLORS[4];
  };

  // Group cells by row (day of week) for rendering
  const rows = useMemo(() => {
    const byRow: DayCell[][] = Array.from({ length: 7 }, () => []);
    for (const cell of grid) {
      byRow[cell.dayOfWeek].push(cell);
    }
    return byRow;
  }, [grid]);

  // Summary stats
  const totalDays = grid.filter((c) => !c.isFuture && c.count > 0).length;
  const totalInRange = grid.filter((c) => !c.isFuture).length;
  const pct = totalInRange > 0 ? Math.round((totalDays / totalInRange) * 100) : 0;

  if (containerWidth === 0) {
    return <View onLayout={handleLayout} style={styles.container} />;
  }

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>
          {totalDays} days active · {pct}% consistency
        </Text>
      </View>

      {/* Month labels */}
      <View style={[styles.monthRow, { paddingLeft: dayLabelWidth + spacing.sm }]}>
        {monthLabels.map((m, i) => (
          <Text
            key={`${m.label}-${i}`}
            style={[
              styles.monthLabel,
              { left: dayLabelWidth + spacing.sm + m.weekIndex * (cellSize + CELL_GAP) },
            ]}
          >
            {m.label}
          </Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.gridContainer}>
        {/* Day-of-week labels */}
        <View style={[styles.dayLabels, { width: dayLabelWidth }]}>
          {DAYS_OF_WEEK.map((label, i) => (
            <View key={i} style={{ height: cellSize, marginBottom: CELL_GAP, justifyContent: 'center' }}>
              <Text style={styles.dayLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Cells */}
        <View style={{ marginLeft: spacing.sm }}>
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} style={[styles.row, { marginBottom: CELL_GAP }]}>
              {row.map((cell) => (
                <Pressable
                  key={cell.date}
                  onPress={() => handleDayPress(cell)}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: getIntensityColor(cell.count, cell.isFuture),
                      borderRadius: CELL_RADIUS,
                      marginRight: CELL_GAP,
                      borderWidth: cell.isToday ? 1 : 0,
                      borderColor: cell.isToday ? colors.tealLight : 'transparent',
                    },
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>

      {/* Tooltip */}
      {selectedDay && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>
            {selectedDay.count > 0
              ? `${selectedDay.count} workout${selectedDay.count > 1 ? 's' : ''} on ${formatDisplayDate(selectedDay.date)}`
              : `Rest day — ${formatDisplayDate(selectedDay.date)}`}
          </Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendLabel}>Less</Text>
        {INTENSITY_COLORS.map((color, i) => (
          <View
            key={i}
            style={[styles.legendCell, { backgroundColor: color, borderRadius: CELL_RADIUS }]}
          />
        ))}
        <Text style={styles.legendLabel}>More</Text>
      </View>
    </View>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDisplayDate = (dateKey: string): string => {
  const d = parseDateKey(dateKey);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  monthRow: {
    position: 'relative',
    height: 16,
    marginBottom: spacing.xs,
  },
  monthLabel: {
    ...typography.small,
    color: colors.textMuted,
    position: 'absolute',
    top: 0,
  },
  gridContainer: {
    flexDirection: 'row',
  },
  dayLabels: {
    justifyContent: 'flex-start',
  },
  dayLabel: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    // dynamic width/height via inline style
  },
  tooltip: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tooltipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: spacing.md,
  },
  legendLabel: {
    ...typography.small,
    color: colors.textMuted,
    marginHorizontal: 2,
  },
  legendCell: {
    width: 12,
    height: 12,
  },
});

export default ActivityHeatmap;
