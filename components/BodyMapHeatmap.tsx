/**
 * BodyMapHeatmap — Aggregate pain visualization over time.
 *
 * Shows front + back body silhouettes side by side with zones
 * colored by average intensity over a selected period.
 * Tap zones for detail tooltip.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path, Ellipse, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { tapLight } from '../lib/haptics';
import {
  BODY_ZONES_FRONT,
  BODY_ZONES_BACK,
  SENSATIONS,
  intensityToColor,
  intensityToSolidColor,
  getAggregateHeatmapData,
  type BodyZoneId,
  type BodyZoneConfig,
  type HeatmapZoneData,
  type TrendDirection,
} from '../lib/bodyMap';
import { colors, typography, spacing, radii } from '@/lib/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

type HeatmapPeriod = 7 | 30 | 90 | null;

const PERIOD_OPTIONS: { key: HeatmapPeriod; label: string }[] = [
  { key: 7, label: '7D' },
  { key: 30, label: '30D' },
  { key: 90, label: '90D' },
  { key: null, label: 'All' },
];

// ─── SVG Paths (compact versions for side-by-side) ───────────────────────────

const BODY_SILHOUETTE = `
  M 150 20
  C 132 20, 120 32, 120 50
  C 120 65, 130 75, 150 75
  C 170 75, 180 65, 180 50
  C 180 32, 168 20, 150 20
  Z
  M 130 78 L 128 100 L 80 108 L 55 145 L 45 200 L 50 240 L 62 240
  L 72 195 L 85 145 L 100 128 L 100 250 L 95 260 L 92 300 L 98 365
  L 95 410 L 95 465 L 92 480 L 110 480 L 118 470 L 120 410 L 125 330
  L 135 290 L 150 280 L 165 290 L 175 330 L 180 410 L 182 470 L 190 480
  L 208 480 L 205 465 L 205 410 L 202 365 L 208 300 L 205 260 L 200 250
  L 200 128 L 215 145 L 228 195 L 238 240 L 250 240 L 255 200 L 245 145
  L 220 108 L 172 100 L 170 78 Z
`;

const BACK_LINES = `
  M 120 140 L 180 140
  M 115 180 L 185 180
  M 118 210 L 182 210
`;

// ─── Zone label lookup ───────────────────────────────────────────────────────

const ALL_ZONES = [...BODY_ZONES_FRONT, ...BODY_ZONES_BACK];
function getZoneLabel(id: BodyZoneId): string {
  return ALL_ZONES.find((z) => z.id === id)?.label ?? id;
}

function getSensationLabel(s: string): string {
  return SENSATIONS.find((x) => x.id === s)?.label ?? s;
}

function getTrendIcon(trend: TrendDirection): string {
  if (trend === 'improving') return 'arrow-down';
  if (trend === 'worsening') return 'arrow-up';
  return 'remove';
}

function getTrendColor(trend: TrendDirection): string {
  if (trend === 'improving') return '#22c55e';
  if (trend === 'worsening') return '#ef4444';
  return colors.textMuted;
}

// ─── Heatmap Zone Overlay ────────────────────────────────────────────────────

function HeatmapZone({
  zone,
  data,
  onPress,
}: {
  zone: BodyZoneConfig;
  data: HeatmapZoneData | undefined;
  onPress: (id: BodyZoneId) => void;
}) {
  const avg = data?.avgIntensity ?? 0;
  const count = data?.entryCount ?? 0;
  // Opacity scales with entry count: more data = more confident
  const baseOpacity = avg > 0 ? Math.min(0.4 + count * 0.06, 1) : 0.08;
  const fill = avg > 0 ? intensityToColor(avg) : 'rgba(148, 163, 184, 0.08)';
  const cx = zone.x + zone.width / 2;
  const cy = zone.y + zone.height / 2;

  return (
    <>
      <Ellipse
        cx={cx}
        cy={cy}
        rx={zone.width / 2}
        ry={zone.height / 2}
        fill={fill}
        opacity={baseOpacity}
        stroke={avg > 0 ? 'rgba(255,255,255,0.12)' : 'rgba(148, 163, 184, 0.08)'}
        strokeWidth={avg > 0 ? 1 : 0.5}
        onPress={() => {
          tapLight();
          onPress(zone.id);
        }}
      />
      {avg > 0 && (
        <SvgText
          x={cx}
          y={cy + 4}
          fill={colors.textPrimary}
          fontSize={8}
          fontWeight="600"
          textAnchor="middle"
          opacity={0.85}
        >
          {avg.toFixed(1)}
        </SvgText>
      )}
    </>
  );
}

// ─── Mini Body SVG ───────────────────────────────────────────────────────────

function MiniBody({
  label,
  zones,
  isBack,
  data,
  onZoneTap,
}: {
  label: string;
  zones: BodyZoneConfig[];
  isBack: boolean;
  data: Record<string, HeatmapZoneData>;
  onZoneTap: (id: BodyZoneId) => void;
}) {
  return (
    <View style={miniStyles.container}>
      <Text style={miniStyles.label}>{label}</Text>
      <View style={miniStyles.svgWrap}>
        <Svg width="100%" height="100%" viewBox="0 0 300 500" preserveAspectRatio="xMidYMid meet">
          <Path
            d={BODY_SILHOUETTE}
            fill="none"
            stroke={colors.textTertiary}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.35}
          />
          {isBack && (
            <Path
              d={BACK_LINES}
              fill="none"
              stroke={colors.textTertiary}
              strokeWidth={1}
              opacity={0.25}
            />
          )}
          {zones.map((zone) => (
            <HeatmapZone
              key={zone.id}
              zone={zone}
              data={data[zone.id]}
              onPress={onZoneTap}
            />
          ))}
        </Svg>
      </View>
    </View>
  );
}

const miniStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  label: {
    ...typography.tiny,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  svgWrap: {
    width: '100%',
    aspectRatio: 300 / 500,
    maxHeight: 320,
  },
});

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ZoneTooltip({
  zoneId,
  data,
  onClose,
}: {
  zoneId: BodyZoneId;
  data: HeatmapZoneData;
  onClose: () => void;
}) {
  return (
    <Pressable style={tooltipStyles.overlay} onPress={onClose}>
      <View style={tooltipStyles.card}>
        <View style={tooltipStyles.header}>
          <Text style={tooltipStyles.title}>{getZoneLabel(zoneId)}</Text>
          <View style={[tooltipStyles.trendBadge, { backgroundColor: getTrendColor(data.trend) + '20' }]}>
            <Ionicons
              name={getTrendIcon(data.trend) as any}
              size={12}
              color={getTrendColor(data.trend)}
            />
            <Text style={[tooltipStyles.trendText, { color: getTrendColor(data.trend) }]}>
              {data.trend === 'improving' ? 'Improving' : data.trend === 'worsening' ? 'Worsening' : 'Stable'}
            </Text>
          </View>
        </View>

        <View style={tooltipStyles.statsRow}>
          <View style={tooltipStyles.stat}>
            <Text style={tooltipStyles.statValue}>{data.avgIntensity}</Text>
            <Text style={tooltipStyles.statLabel}>Avg</Text>
          </View>
          <View style={tooltipStyles.stat}>
            <Text style={tooltipStyles.statValue}>{data.maxIntensity}</Text>
            <Text style={tooltipStyles.statLabel}>Peak</Text>
          </View>
          <View style={tooltipStyles.stat}>
            <Text style={tooltipStyles.statValue}>{data.entryCount}</Text>
            <Text style={tooltipStyles.statLabel}>Entries</Text>
          </View>
        </View>

        <View style={tooltipStyles.sensationRow}>
          <Text style={tooltipStyles.sensationLabel}>
            Most common: {getSensationLabel(data.dominantSensation)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const tooltipStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    width: 260,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  trendText: {
    ...typography.tiny,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  stat: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
  },
  sensationRow: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  sensationLabel: {
    ...typography.small,
    color: colors.textSecondary,
  },
});

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BodyMapHeatmap() {
  const [period, setPeriod] = useState<HeatmapPeriod>(30);
  const [data, setData] = useState<Record<string, HeatmapZoneData>>({});
  const [loading, setLoading] = useState(true);
  const [tooltipZone, setTooltipZone] = useState<BodyZoneId | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const result = await getAggregateHeatmapData(period);
    setData(result);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleZoneTap = (id: BodyZoneId) => {
    if (data[id]) {
      setTooltipZone(id);
    }
  };

  // Find most affected & most improved zones
  const zones = Object.entries(data) as [BodyZoneId, HeatmapZoneData][];
  const mostAffected = zones.length > 0
    ? zones.reduce((a, b) => (b[1].avgIntensity > a[1].avgIntensity ? b : a))
    : null;
  const improving = zones.filter(([, d]) => d.trend === 'improving');
  const mostImproved = improving.length > 0
    ? improving.reduce((a, b) => (b[1].entryCount > a[1].entryCount ? b : a))
    : null;

  const hasData = zones.length > 0;

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="flame" size={16} color={colors.teal} />
        </View>
        <Text style={styles.title}>Pain Heatmap</Text>
      </View>

      {/* Period Selector */}
      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((opt) => {
          const active = period === opt.key;
          return (
            <Pressable
              key={opt.label}
              onPress={() => {
                tapLight();
                setPeriod(opt.key);
              }}
              style={[styles.periodPill, active && styles.periodPillActive]}
            >
              <Text style={[styles.periodText, active && styles.periodTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.teal} size="small" />
        </View>
      ) : !hasData ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="body-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            No pain data for this period yet
          </Text>
        </View>
      ) : (
        <>
          {/* Side-by-Side Body Maps */}
          <View style={styles.mapsRow}>
            <MiniBody
              label="Front"
              zones={BODY_ZONES_FRONT}
              isBack={false}
              data={data}
              onZoneTap={handleZoneTap}
            />
            <MiniBody
              label="Back"
              zones={BODY_ZONES_BACK}
              isBack={true}
              data={data}
              onZoneTap={handleZoneTap}
            />
          </View>

          {/* Summary Stats */}
          <View style={styles.summaryRow}>
            {mostAffected && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Most affected</Text>
                <Text style={styles.summaryValue}>
                  {getZoneLabel(mostAffected[0])}
                </Text>
                <Text style={styles.summaryMeta}>
                  avg {mostAffected[1].avgIntensity}/10
                </Text>
              </View>
            )}
            {mostImproved && (
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryLabel, { color: '#22c55e' }]}>Most improved</Text>
                <Text style={styles.summaryValue}>
                  {getZoneLabel(mostImproved[0])}
                </Text>
                <Text style={[styles.summaryMeta, { color: '#22c55e' }]}>
                  ↓ trending down
                </Text>
              </View>
            )}
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
              <Text style={styles.legendText}>Low</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={styles.legendText}>Med</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.legendText}>High</Text>
            </View>
            <Text style={styles.legendHint}>Tap zones for details</Text>
          </View>
        </>
      )}

      {/* Tooltip overlay */}
      {tooltipZone && data[tooltipZone] && (
        <ZoneTooltip
          zoneId={tooltipZone}
          data={data[tooltipZone]}
          onClose={() => setTooltipZone(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  periodPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodPillActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.tealBorder,
  },
  periodText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '600',
  },
  periodTextActive: {
    color: colors.teal,
  },
  loadingWrap: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
  mapsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    gap: 2,
  },
  summaryLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  summaryValue: {
    ...typography.bodySemibold,
    color: colors.textPrimary,
  },
  summaryMeta: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...typography.tiny,
    color: colors.textTertiary,
  },
  legendHint: {
    ...typography.tiny,
    color: colors.textMuted,
    marginLeft: 'auto',
    fontStyle: 'italic',
  },
});
