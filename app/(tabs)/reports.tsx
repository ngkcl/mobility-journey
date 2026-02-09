import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Image,
  StyleSheet,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import {
  listReports,
  getOrGenerateReport,
  getCurrentWeekStart,
  getLastWeekStart,
  markReportShared,
} from '../../lib/weeklyReportStorage';
import {
  formatReportForSharing,
  type WeeklyReport,
  type Insight,
  type TrendDirection,
} from '../../lib/weeklyReport';
import { getInsightColor, getInsightBgColor } from '../../lib/reportInsights';
import EmptyState from '../../components/EmptyState';

type ReportListItem = {
  id: string;
  week_start: string;
  week_end: string;
  report_json: WeeklyReport;
  shared_at: string | null;
};

const getTrendIcon = (trend: TrendDirection): string => {
  switch (trend) {
    case 'improving':
      return '↑';
    case 'declining':
      return '↓';
    default:
      return '→';
  }
};

const getTrendColor = (trend: TrendDirection, lowerIsBetter = false): string => {
  if (trend === 'stable') return colors.textSecondary;
  if (lowerIsBetter) {
    return trend === 'improving' ? colors.success : colors.error;
  }
  return trend === 'improving' ? colors.success : colors.error;
};

const getScoreEmoji = (score: number): string => {
  if (score >= 90) return '🏆';
  if (score >= 75) return '🔥';
  if (score >= 60) return '💪';
  if (score >= 40) return '📈';
  return '🎯';
};

export default function ReportsScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadReports = useCallback(async () => {
    const data = await listReports(12);
    setReports(data);
    
    // Auto-select the most recent report
    if (data.length > 0 && !selectedReport) {
      setSelectedReport(data[0].report_json);
    }
    
    setIsLoading(false);
  }, [selectedReport]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const handleGenerateReport = async (weekStart: Date) => {
    setIsGenerating(true);
    try {
      const report = await getOrGenerateReport(weekStart);
      setSelectedReport(report);
      await loadReports();
    } catch (error) {
      console.error('Failed to generate report:', error);
    }
    setIsGenerating(false);
  };

  const handleShare = async () => {
    if (!selectedReport) return;
    
    const shareText = formatReportForSharing(selectedReport);
    
    try {
      await Share.share({
        message: shareText,
        title: `Weekly Report - ${selectedReport.weekStart}`,
      });
      
      // Mark as shared
      await markReportShared(selectedReport.weekStart);
      await loadReports();
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const selectWeek = (report: ReportListItem) => {
    setSelectedReport(report.report_json);
  };

  if (isLoading) {
    return (
      <View style={[shared.screen, styles.centered]}>
        <ActivityIndicator size="large" color={colors.teal} />
        <Text style={styles.loadingText}>Loading reports...</Text>
      </View>
    );
  }

  return (
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={shared.pageTitle}>Weekly Reports</Text>
          <Pressable
            onPress={() => handleGenerateReport(getLastWeekStart())}
            disabled={isGenerating}
            style={({ pressed }) => [
              styles.generateBtn,
              pressed && styles.btnPressed,
            ]}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <>
                <Ionicons name="add" size={18} color={colors.teal} />
                <Text style={styles.generateBtnText}>Generate</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Week Selector */}
        {reports.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.weekSelector}
            contentContainerStyle={styles.weekSelectorContent}
          >
            {reports.map((report) => {
              const isSelected = selectedReport?.weekStart === report.week_start;
              return (
                <Pressable
                  key={report.id}
                  onPress={() => selectWeek(report)}
                  style={[
                    styles.weekPill,
                    isSelected && styles.weekPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.weekPillText,
                      isSelected && styles.weekPillTextActive,
                    ]}
                  >
                    {format(parseISO(report.week_start), 'MMM d')}
                  </Text>
                  {report.shared_at && (
                    <Ionicons
                      name="share-social"
                      size={12}
                      color={isSelected ? colors.bgDeep : colors.textMuted}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Report Content */}
        {selectedReport ? (
          <View style={styles.reportContainer}>
            {/* Score Card */}
            <View style={styles.scoreCard}>
              <View style={styles.scoreGlow} />
              <View style={styles.scoreHeader}>
                <Text style={styles.scoreEmoji}>
                  {getScoreEmoji(selectedReport.overallScore)}
                </Text>
                <Text style={styles.scoreValue}>{selectedReport.overallScore}</Text>
                <Text style={styles.scoreLabel}>/ 100</Text>
              </View>
              {selectedReport.previousWeekScore !== null && (
                <Text style={styles.scoreCompare}>
                  {selectedReport.overallScore > selectedReport.previousWeekScore
                    ? `↑ ${selectedReport.overallScore - selectedReport.previousWeekScore} from last week`
                    : selectedReport.overallScore < selectedReport.previousWeekScore
                    ? `↓ ${selectedReport.previousWeekScore - selectedReport.overallScore} from last week`
                    : 'Same as last week'}
                </Text>
              )}
              <Text style={styles.scoreWeek}>
                Week of {format(parseISO(selectedReport.weekStart), 'MMMM d, yyyy')}
              </Text>
            </View>

            {/* Workout Summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏋️ Workouts</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {selectedReport.workoutSummary.totalSessions}
                  </Text>
                  <Text style={styles.statLabel}>Sessions</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {selectedReport.workoutSummary.correctiveSessions}
                  </Text>
                  <Text style={styles.statLabel}>Corrective</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {selectedReport.workoutSummary.gymSessions}
                  </Text>
                  <Text style={styles.statLabel}>Gym</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {selectedReport.workoutSummary.consistencyPct}%
                  </Text>
                  <Text style={styles.statLabel}>Consistency</Text>
                </View>
              </View>

              {/* Asymmetry */}
              <View style={styles.asymmetryRow}>
                <View style={styles.asymmetryBar}>
                  <View
                    style={[
                      styles.asymmetryLeft,
                      {
                        flex:
                          selectedReport.workoutSummary.leftVolume /
                          (selectedReport.workoutSummary.leftVolume +
                            selectedReport.workoutSummary.rightVolume || 1),
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.asymmetryRight,
                      {
                        flex:
                          selectedReport.workoutSummary.rightVolume /
                          (selectedReport.workoutSummary.leftVolume +
                            selectedReport.workoutSummary.rightVolume || 1),
                      },
                    ]}
                  />
                </View>
                <View style={styles.asymmetryLabels}>
                  <Text style={styles.asymmetryLabel}>
                    L: {Math.round(selectedReport.workoutSummary.leftVolume)} kg
                  </Text>
                  <Text style={styles.asymmetryLabel}>
                    R: {Math.round(selectedReport.workoutSummary.rightVolume)} kg
                  </Text>
                </View>
              </View>
            </View>

            {/* Metrics Summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Metrics</Text>
              <View style={styles.metricsGrid}>
                {selectedReport.metricsSummary.avgPainLevel !== null && (
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Pain</Text>
                    <View style={styles.metricRow}>
                      <Text style={styles.metricValue}>
                        {selectedReport.metricsSummary.avgPainLevel}
                      </Text>
                      <Text
                        style={[
                          styles.metricTrend,
                          {
                            color: getTrendColor(
                              selectedReport.metricsSummary.painTrend,
                              true
                            ),
                          },
                        ]}
                      >
                        {getTrendIcon(selectedReport.metricsSummary.painTrend)}
                      </Text>
                    </View>
                  </View>
                )}
                {selectedReport.metricsSummary.avgPostureScore !== null && (
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Posture</Text>
                    <View style={styles.metricRow}>
                      <Text style={styles.metricValue}>
                        {selectedReport.metricsSummary.avgPostureScore}
                      </Text>
                      <Text
                        style={[
                          styles.metricTrend,
                          {
                            color: getTrendColor(
                              selectedReport.metricsSummary.postureTrend
                            ),
                          },
                        ]}
                      >
                        {getTrendIcon(selectedReport.metricsSummary.postureTrend)}
                      </Text>
                    </View>
                  </View>
                )}
                {selectedReport.metricsSummary.avgEnergyLevel !== null && (
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Energy</Text>
                    <Text style={styles.metricValue}>
                      {selectedReport.metricsSummary.avgEnergyLevel}
                    </Text>
                  </View>
                )}
                {selectedReport.metricsSummary.avgSymmetryScore !== null && (
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Symmetry</Text>
                    <Text style={styles.metricValue}>
                      {selectedReport.metricsSummary.avgSymmetryScore}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Photo Comparison */}
            {selectedReport.photoSummary.hasComparisonPair && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📸 Progress</Text>
                <View style={styles.photoCompare}>
                  {selectedReport.photoSummary.earliestPhotoUrl && (
                    <View style={styles.photoBox}>
                      <Image
                        source={{ uri: selectedReport.photoSummary.earliestPhotoUrl }}
                        style={styles.photoImage}
                        resizeMode="cover"
                      />
                      <Text style={styles.photoLabel}>Start</Text>
                    </View>
                  )}
                  {selectedReport.photoSummary.latestPhotoUrl && (
                    <View style={styles.photoBox}>
                      <Image
                        source={{ uri: selectedReport.photoSummary.latestPhotoUrl }}
                        style={styles.photoImage}
                        resizeMode="cover"
                      />
                      <Text style={styles.photoLabel}>End</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Insights */}
            {selectedReport.insights.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💡 Insights</Text>
                {selectedReport.insights.map((insight) => (
                  <Pressable
                    key={insight.id}
                    onPress={() =>
                      insight.action && router.push(insight.action.route as any)
                    }
                    style={[
                      styles.insightCard,
                      { backgroundColor: getInsightBgColor(insight.type) },
                    ]}
                  >
                    <Text style={styles.insightIcon}>{insight.icon}</Text>
                    <View style={styles.insightContent}>
                      <Text
                        style={[
                          styles.insightTitle,
                          { color: getInsightColor(insight.type) },
                        ]}
                      >
                        {insight.title}
                      </Text>
                      <Text style={styles.insightDesc}>{insight.description}</Text>
                    </View>
                    {insight.action && (
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.textMuted}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Share Button */}
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.shareBtn,
                pressed && styles.btnPressed,
              ]}
            >
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={styles.shareBtnText}>Share Report</Text>
            </Pressable>
          </View>
        ) : (
          <EmptyState
            icon="document-text-outline"
            title="No Reports Yet"
            description="Generate your first weekly report to see your progress summary."
            actionLabel="Generate Report"
            onAction={() => handleGenerateReport(getLastWeekStart())}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.teal,
  },
  generateBtnText: {
    ...typography.small,
    color: colors.teal,
  },
  btnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  weekSelector: {
    marginBottom: spacing.lg,
  },
  weekSelectorContent: {
    gap: spacing.sm,
  },
  weekPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekPillActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  weekPillText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  weekPillTextActive: {
    color: colors.bgDeep,
    fontWeight: '600',
  },
  reportContainer: {
    gap: spacing.lg,
  },
  scoreCard: {
    backgroundColor: colors.bgDeep,
    borderRadius: radii['2xl'],
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  scoreGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.teal,
    opacity: 0.15,
    top: -60,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  scoreEmoji: {
    fontSize: 36,
    marginRight: spacing.sm,
  },
  scoreValue: {
    ...typography.hero,
    color: colors.teal,
    fontSize: 64,
  },
  scoreLabel: {
    ...typography.h3,
    color: colors.textMuted,
  },
  scoreCompare: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  scoreWeek: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  section: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statItem: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  statValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  asymmetryRow: {
    marginTop: spacing.lg,
  },
  asymmetryBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.bgBase,
  },
  asymmetryLeft: {
    backgroundColor: colors.leftSide,
  },
  asymmetryRight: {
    backgroundColor: colors.rightSide,
  },
  asymmetryLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  asymmetryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    minWidth: 80,
    backgroundColor: colors.bgBase,
    borderRadius: radii.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 4,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  metricTrend: {
    ...typography.h3,
    fontWeight: '600',
  },
  photoCompare: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  photoBox: {
    flex: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgBase,
  },
  photoImage: {
    width: '100%',
    height: 150,
  },
  photoLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  insightIcon: {
    fontSize: 24,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    ...typography.bodySemibold,
    marginBottom: 2,
  },
  insightDesc: {
    ...typography.small,
    color: colors.textSecondary,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.teal,
    paddingVertical: spacing.md,
    borderRadius: radii.xl,
    marginTop: spacing.md,
  },
  shareBtnText: {
    ...typography.bodySemibold,
    color: '#fff',
  },
});
