/**
 * Progress Report Screen
 *
 * Generates a comprehensive PDF report for sharing with physiotherapists.
 * Aggregates data from all app sources and renders as a clean HTML→PDF.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// @ts-ignore - expo-print types not bundled
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { colors, typography, spacing, radii } from '../lib/theme';
import { fetchReportData, generateReportHTML } from '../lib/progressReport';
import * as Haptics from '../lib/haptics';

type ReportPeriod = 7 | 14 | 30 | 60 | 90;

interface PeriodOption {
  days: ReportPeriod;
  label: string;
  description: string;
}

const PERIODS: PeriodOption[] = [
  { days: 7, label: '1 Week', description: 'Quick snapshot' },
  { days: 14, label: '2 Weeks', description: 'Short-term review' },
  { days: 30, label: '1 Month', description: 'Standard report' },
  { days: 60, label: '2 Months', description: 'Extended analysis' },
  { days: 90, label: '3 Months', description: 'Quarterly review' },
];

export default function ProgressReportScreen() {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>(30);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [lastGeneratedHTML, setLastGeneratedHTML] = useState<string | null>(
    null
  );
  const [reportSummary, setReportSummary] = useState<{
    metrics: number;
    workouts: number;
    bodyMap: number;
    goals: number;
  } | null>(null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setLastGeneratedHTML(null);
    setReportSummary(null);
    Haptics.tapMedium();

    try {
      const data = await fetchReportData(selectedPeriod);
      const html = generateReportHTML(data);
      setLastGeneratedHTML(html);
      setReportSummary({
        metrics: data.metrics.entries.length,
        workouts: data.workouts.total,
        bodyMap: data.bodyMap.totalEntries,
        goals: data.goals.active.length + data.goals.completed.length,
      });
      Haptics.notifySuccess();
    } catch (error) {
      console.error('Report generation failed:', error);
      Alert.alert(
        'Generation Failed',
        'Could not generate report. Please check your data connection and try again.'
      );
    } finally {
      setGenerating(false);
    }
  }, [selectedPeriod]);

  const handleSharePDF = useCallback(async () => {
    if (!lastGeneratedHTML) return;
    setSharing(true);
    Haptics.tapMedium();

    try {
      // Generate PDF from HTML
      const { uri } = await Print.printToFileAsync({
        html: lastGeneratedHTML,
        base64: false,
      });

      // Rename to something meaningful
      const fileName = `Progress_Report_${selectedPeriod}d_${new Date().toISOString().split('T')[0]}.pdf`;
      const newUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.moveAsync({ from: uri, to: newUri });

      // Share
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Progress Report',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          'Sharing Not Available',
          'Sharing is not supported on this device.'
        );
      }
      Haptics.notifySuccess();
    } catch (error) {
      console.error('PDF sharing failed:', error);
      Alert.alert('Share Failed', 'Could not create or share the PDF.');
    } finally {
      setSharing(false);
    }
  }, [lastGeneratedHTML, selectedPeriod]);

  const handlePreviewHTML = useCallback(async () => {
    if (!lastGeneratedHTML) return;
    Haptics.tapLight();

    try {
      await Print.printAsync({ html: lastGeneratedHTML });
    } catch (error) {
      // User cancelled print dialog — not an error
    }
  }, [lastGeneratedHTML]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress Report</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <Ionicons
            name="document-text-outline"
            size={40}
            color={colors.teal}
          />
          <Text style={styles.heroTitle}>
            Generate a Comprehensive Report
          </Text>
          <Text style={styles.heroSubtitle}>
            Create a detailed PDF report of your rehabilitation progress.
            Perfect for sharing with your physiotherapist or healthcare
            provider.
          </Text>
        </View>

        {/* Period Selection */}
        <Text style={styles.sectionLabel}>REPORT PERIOD</Text>
        <View style={styles.periodGrid}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.days}
              style={[
                styles.periodCard,
                selectedPeriod === p.days && styles.periodCardSelected,
              ]}
              onPress={() => {
                setSelectedPeriod(p.days);
                setLastGeneratedHTML(null);
                setReportSummary(null);
                Haptics.selectionTick();
              }}
            >
              <Text
                style={[
                  styles.periodLabel,
                  selectedPeriod === p.days && styles.periodLabelSelected,
                ]}
              >
                {p.label}
              </Text>
              <Text
                style={[
                  styles.periodDesc,
                  selectedPeriod === p.days && styles.periodDescSelected,
                ]}
              >
                {p.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Report Contents */}
        <Text style={styles.sectionLabel}>REPORT INCLUDES</Text>
        <View style={styles.contentsCard}>
          {[
            {
              icon: 'analytics-outline' as const,
              label: 'Health Metrics',
              desc: 'Pain, posture, symmetry trends',
            },
            {
              icon: 'barbell-outline' as const,
              label: 'Workout History',
              desc: 'Sessions, consistency, streaks',
            },
            {
              icon: 'body-outline' as const,
              label: 'Body Map Analysis',
              desc: 'Pain zones, asymmetries',
            },
            {
              icon: 'flag-outline' as const,
              label: 'Goals Progress',
              desc: 'Active and completed goals',
            },
            {
              icon: 'fitness-outline' as const,
              label: 'Training Program',
              desc: 'Current program status',
            },
            {
              icon: 'flask-outline' as const,
              label: 'Exercise Effectiveness',
              desc: 'Which exercises help most',
            },
            {
              icon: 'bulb-outline' as const,
              label: 'Recommendations',
              desc: 'AI-generated suggestions',
            },
          ].map((item, i) => (
            <View key={i} style={styles.contentRow}>
              <View style={styles.contentIcon}>
                <Ionicons name={item.icon} size={20} color={colors.teal} />
              </View>
              <View style={styles.contentText}>
                <Text style={styles.contentLabel}>{item.label}</Text>
                <Text style={styles.contentDesc}>{item.desc}</Text>
              </View>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.teal}
              />
            </View>
          ))}
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[
            styles.generateButton,
            generating && styles.generateButtonDisabled,
          ]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.generateButtonText}>
                Generating Report...
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="create-outline" size={22} color="#fff" />
              <Text style={styles.generateButtonText}>
                Generate {PERIODS.find((p) => p.days === selectedPeriod)?.label}{' '}
                Report
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Report Ready */}
        {lastGeneratedHTML && reportSummary && (
          <View style={styles.readyCard}>
            <View style={styles.readyHeader}>
              <Ionicons
                name="checkmark-circle"
                size={28}
                color={colors.success}
              />
              <Text style={styles.readyTitle}>Report Ready!</Text>
            </View>

            {/* Summary Stats */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {reportSummary.metrics}
                </Text>
                <Text style={styles.summaryLabel}>Check-ins</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {reportSummary.workouts}
                </Text>
                <Text style={styles.summaryLabel}>Workouts</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {reportSummary.bodyMap}
                </Text>
                <Text style={styles.summaryLabel}>Pain Entries</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {reportSummary.goals}
                </Text>
                <Text style={styles.summaryLabel}>Goals</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleSharePDF}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="share-outline" size={20} color="#fff" />
                )}
                <Text style={styles.shareButtonText}>
                  {sharing ? 'Creating PDF...' : 'Share as PDF'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.previewButton}
                onPress={handlePreviewHTML}
              >
                <Ionicons
                  name="eye-outline"
                  size={20}
                  color={colors.teal}
                />
                <Text style={styles.previewButtonText}>Preview</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Tip */}
        <View style={styles.tipCard}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.tealLight}
          />
          <Text style={styles.tipText}>
            Tip: Share your report with your physiotherapist before appointments
            for more productive sessions. The more data you log, the richer
            your report will be.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing["2xl"],
  },

  // Hero
  heroCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  heroTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Section Label
  sectionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Period Grid
  periodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  periodCard: {
    flex: 1,
    minWidth: '28%' as any,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodCardSelected: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  periodLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  periodLabelSelected: {
    color: colors.teal,
  },
  periodDesc: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 10,
    marginTop: 2,
  },
  periodDescSelected: {
    color: colors.tealLight,
  },

  // Report Contents
  contentsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  contentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  contentText: { flex: 1 },
  contentLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  contentDesc: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 11,
  },

  // Generate Button
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    ...typography.bodyMedium,
    color: '#fff',
    fontSize: 16,
  },

  // Report Ready
  readyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    marginBottom: spacing.lg,
  },
  readyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  readyTitle: {
    ...typography.h3,
    color: colors.success,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
    borderRadius: radii.md,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  shareButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  shareButtonText: {
    ...typography.bodyMedium,
    color: '#fff',
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealDim,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  previewButtonText: {
    ...typography.bodyMedium,
    color: colors.teal,
  },

  // Tip
  tipCard: {
    flexDirection: 'row',
    backgroundColor: colors.tealDim,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  tipText: {
    ...typography.caption,
    color: colors.tealLight,
    flex: 1,
    lineHeight: 18,
  },
});
