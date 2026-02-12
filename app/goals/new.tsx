import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { colors, typography, spacing, radii, shared } from '../../lib/theme';
import { createGoal, type GoalType, type CreateGoalInput } from '../../lib/goals';

// ─── Goal Type Config ─────────────────────────────────────────────────────────

type GoalTypeOption = {
  type: GoalType;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  description: string;
  example: string;
  color: string;
  colorDim: string;
  defaultTarget: number;
  defaultStart: number;
  unit: string;
  lowerIsBetter: boolean;
};

const GOAL_TYPES: GoalTypeOption[] = [
  {
    type: 'pain_reduction',
    label: 'Pain Reduction',
    icon: 'flash-outline',
    description: 'Track your pain level decreasing over time',
    example: 'e.g., Reduce back pain from 7 to 3',
    color: colors.error,
    colorDim: colors.errorDim,
    defaultTarget: 3,
    defaultStart: 6,
    unit: '/10',
    lowerIsBetter: true,
  },
  {
    type: 'symmetry_improvement',
    label: 'Symmetry',
    icon: 'git-compare-outline',
    description: 'Improve left-right muscle balance',
    example: 'e.g., Reach 85% symmetry score',
    color: colors.info,
    colorDim: colors.infoDim,
    defaultTarget: 85,
    defaultStart: 60,
    unit: '%',
    lowerIsBetter: false,
  },
  {
    type: 'posture_score',
    label: 'Posture Score',
    icon: 'body-outline',
    description: 'Improve your overall posture assessment',
    example: 'e.g., Reach a posture score of 80+',
    color: colors.teal,
    colorDim: colors.tealDim,
    defaultTarget: 80,
    defaultStart: 50,
    unit: '/100',
    lowerIsBetter: false,
  },
  {
    type: 'workout_consistency',
    label: 'Consistency',
    icon: 'calendar-outline',
    description: 'Stay consistent with your workout schedule',
    example: 'e.g., Complete 80% of scheduled sessions',
    color: colors.success,
    colorDim: colors.successDim,
    defaultTarget: 80,
    defaultStart: 40,
    unit: '%',
    lowerIsBetter: false,
  },
  {
    type: 'workout_streak',
    label: 'Workout Streak',
    icon: 'flame-outline',
    description: 'Build a consecutive workout streak',
    example: 'e.g., Maintain a 30-day streak',
    color: colors.warning,
    colorDim: colors.warningDim,
    defaultTarget: 30,
    defaultStart: 0,
    unit: ' days',
    lowerIsBetter: false,
  },
  {
    type: 'custom',
    label: 'Custom Goal',
    icon: 'star-outline',
    description: 'Define your own measurable goal',
    example: 'e.g., Any metric you want to track',
    color: colors.textSecondary,
    colorDim: 'rgba(203, 213, 225, 0.1)',
    defaultTarget: 100,
    defaultStart: 0,
    unit: '',
    lowerIsBetter: false,
  },
];

// ─── Deadline Presets ─────────────────────────────────────────────────────────

const DEADLINE_OPTIONS = [
  { label: '4 weeks', weeks: 4 },
  { label: '8 weeks', weeks: 8 },
  { label: '12 weeks', weeks: 12 },
  { label: '6 months', weeks: 26 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const addWeeks = (weeks: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d;
};

const formatDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ─── Component ────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

export default function NewGoalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    prefillType?: string;
    prefillTarget?: string;
    prefillStarting?: string;
    prefillWeeks?: string;
  }>();
  const [step, setStep] = useState<WizardStep>(1);
  const [saving, setSaving] = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(false);

  // Step 1: Goal type
  const [selectedType, setSelectedType] = useState<GoalTypeOption | null>(null);

  // Step 2: Values
  const [startValue, setStartValue] = useState(0);
  const [targetValue, setTargetValue] = useState(0);

  // Step 3: Deadline
  const [deadlineWeeks, setDeadlineWeeks] = useState(8);

  // Apply prefill from suggestion (one-time)
  React.useEffect(() => {
    if (prefillApplied || !params.prefillType) return;
    const match = GOAL_TYPES.find((gt) => gt.type === params.prefillType);
    if (match) {
      setSelectedType(match);
      if (params.prefillStarting) setStartValue(Number(params.prefillStarting));
      if (params.prefillTarget) setTargetValue(Number(params.prefillTarget));
      if (params.prefillWeeks) setDeadlineWeeks(Number(params.prefillWeeks));
      setStep(2); // Skip type selection, go to values
    }
    setPrefillApplied(true);
  }, [params, prefillApplied]);

  const deadline = addWeeks(deadlineWeeks);

  // ─── Step Navigation ──────────────────────────────────────────────────────

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return selectedType !== null;
      case 2: {
        if (!selectedType) return false;
        if (selectedType.lowerIsBetter) return targetValue < startValue;
        return targetValue > startValue;
      }
      case 3:
        return deadlineWeeks > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (step < 4) setStep((step + 1) as WizardStep);
  };

  const goBack = () => {
    if (step > 1) setStep((step - 1) as WizardStep);
    else router.back();
  };

  const selectGoalType = (option: GoalTypeOption) => {
    setSelectedType(option);
    setStartValue(option.defaultStart);
    setTargetValue(option.defaultTarget);
  };

  // ─── Value Adjusters ──────────────────────────────────────────────────────

  const adjustValue = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    delta: number,
    min: number,
    max: number,
  ) => {
    setter((prev) => Math.min(max, Math.max(min, prev + delta)));
  };

  // ─── Save Goal ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!selectedType) return;
    setSaving(true);
    try {
      const input: CreateGoalInput = {
        type: selectedType.type,
        title: selectedType.label,
        description: selectedType.description,
        target_value: targetValue,
        starting_value: startValue,
        current_value: startValue,
        deadline: deadline.toISOString(),
        status: 'active',
      };
      const goal = await createGoal(input);
      if (goal) {
        router.back();
      } else {
        Alert.alert('Error', 'Failed to create goal. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }, [selectedType, targetValue, startValue, deadline, router]);

  // ─── Step Indicator ───────────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <View style={styles.stepRow}>
      {([1, 2, 3, 4] as const).map((s) => (
        <View key={s} style={styles.stepItem}>
          <View
            style={[
              styles.stepDot,
              s === step && styles.stepDotActive,
              s < step && styles.stepDotDone,
            ]}
          >
            {s < step ? (
              <Ionicons name="checkmark" size={12} color={colors.bgDeep} />
            ) : (
              <Text style={[styles.stepNum, s === step && styles.stepNumActive]}>
                {s}
              </Text>
            )}
          </View>
          {s < 4 && (
            <View style={[styles.stepLine, s < step && styles.stepLineDone]} />
          )}
        </View>
      ))}
    </View>
  );

  // ─── Step 1: Select Type ──────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What do you want to achieve?</Text>
      <Text style={styles.stepSubtitle}>Pick the type of goal that matches your focus</Text>
      {GOAL_TYPES.map((option) => {
        const isSelected = selectedType?.type === option.type;
        return (
          <Pressable
            key={option.type}
            style={[
              styles.typeCard,
              isSelected && { borderColor: option.color, backgroundColor: option.colorDim },
            ]}
            onPress={() => selectGoalType(option)}
          >
            <View style={[styles.typeIconWrap, { backgroundColor: option.colorDim }]}>
              <Ionicons name={option.icon} size={22} color={option.color} />
            </View>
            <View style={styles.typeTextWrap}>
              <Text style={styles.typeLabel}>{option.label}</Text>
              <Text style={styles.typeDesc}>{option.description}</Text>
              <Text style={styles.typeExample}>{option.example}</Text>
            </View>
            {isSelected && (
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={option.color}
                style={styles.typeCheck}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );

  // ─── Step 2: Set Target Values ────────────────────────────────────────────

  const renderValueAdjuster = (
    label: string,
    value: number,
    setter: React.Dispatch<React.SetStateAction<number>>,
    min: number,
    max: number,
    stepSize: number,
  ) => (
    <View style={styles.adjusterCard}>
      <Text style={styles.adjusterLabel}>{label}</Text>
      <View style={styles.adjusterRow}>
        <Pressable
          style={styles.adjusterBtn}
          onPress={() => adjustValue(setter, -stepSize, min, max)}
        >
          <Ionicons name="remove" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.adjusterValue}>
          {value}
          <Text style={styles.adjusterUnit}>{selectedType?.unit ?? ''}</Text>
        </Text>
        <Pressable
          style={styles.adjusterBtn}
          onPress={() => adjustValue(setter, stepSize, min, max)}
        >
          <Ionicons name="add" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );

  const renderStep2 = () => {
    if (!selectedType) return null;
    const { lowerIsBetter, unit } = selectedType;
    const stepSize = selectedType.type === 'workout_streak' ? 5 : selectedType.type === 'pain_reduction' ? 1 : 5;
    const max = selectedType.type === 'pain_reduction' ? 10 : selectedType.type === 'workout_streak' ? 365 : 100;

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Set your numbers</Text>
        <Text style={styles.stepSubtitle}>
          {lowerIsBetter
            ? 'Your target should be lower than your starting point'
            : 'Your target should be higher than your starting point'}
        </Text>
        {renderValueAdjuster('Starting value', startValue, setStartValue, 0, max, stepSize)}
        <Ionicons
          name={lowerIsBetter ? 'arrow-down' : 'arrow-up'}
          size={28}
          color={colors.teal}
          style={styles.arrowIcon}
        />
        {renderValueAdjuster('Target value', targetValue, setTargetValue, 0, max, stepSize)}
        {!canProceed() && selectedType && (
          <Text style={styles.validationMsg}>
            {lowerIsBetter
              ? 'Target must be lower than starting value'
              : 'Target must be higher than starting value'}
          </Text>
        )}
      </View>
    );
  };

  // ─── Step 3: Set Deadline ─────────────────────────────────────────────────

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Set a deadline</Text>
      <Text style={styles.stepSubtitle}>
        When do you want to reach this goal?
      </Text>
      {DEADLINE_OPTIONS.map((option) => {
        const isSelected = deadlineWeeks === option.weeks;
        const targetDate = addWeeks(option.weeks);
        return (
          <Pressable
            key={option.weeks}
            style={[styles.deadlineCard, isSelected && styles.deadlineCardActive]}
            onPress={() => setDeadlineWeeks(option.weeks)}
          >
            <View>
              <Text style={[styles.deadlineLabel, isSelected && styles.deadlineLabelActive]}>
                {option.label}
              </Text>
              <Text style={styles.deadlineDate}>{formatDate(targetDate)}</Text>
            </View>
            {isSelected && (
              <Ionicons name="checkmark-circle" size={24} color={colors.teal} />
            )}
          </Pressable>
        );
      })}
    </View>
  );

  // ─── Step 4: Review & Confirm ─────────────────────────────────────────────

  const renderStep4 = () => {
    if (!selectedType) return null;
    const totalDelta = selectedType.lowerIsBetter
      ? startValue - targetValue
      : targetValue - startValue;
    const weeksCount = deadlineWeeks;
    const ratePerWeek = weeksCount > 0 ? (totalDelta / weeksCount).toFixed(1) : '—';

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Review your goal</Text>
        <Text style={styles.stepSubtitle}>Confirm everything looks good</Text>

        <View style={styles.reviewCard}>
          <View style={[styles.reviewIconWrap, { backgroundColor: selectedType.colorDim }]}>
            <Ionicons name={selectedType.icon} size={32} color={selectedType.color} />
          </View>
          <Text style={styles.reviewTitle}>{selectedType.label}</Text>
          <Text style={styles.reviewDesc}>{selectedType.description}</Text>

          <View style={styles.reviewDivider} />

          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Starting</Text>
            <Text style={styles.reviewValue}>
              {startValue}{selectedType.unit}
            </Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Target</Text>
            <Text style={[styles.reviewValue, { color: colors.teal }]}>
              {targetValue}{selectedType.unit}
            </Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Deadline</Text>
            <Text style={styles.reviewValue}>{formatDate(deadline)}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Pace needed</Text>
            <Text style={styles.reviewValue}>
              ~{ratePerWeek}{selectedType.unit}/week
            </Text>
          </View>
        </View>

        {/* Milestones */}
        <View style={styles.milestonesCard}>
          <Text style={styles.milestonesTitle}>Projected Milestones</Text>
          {[25, 50, 75, 100].map((pct) => {
            const weeksToMilestone = Math.round((pct / 100) * weeksCount);
            const milestoneDate = addWeeks(weeksToMilestone);
            const milestoneValue = selectedType.lowerIsBetter
              ? startValue - Math.round((pct / 100) * totalDelta)
              : startValue + Math.round((pct / 100) * totalDelta);
            return (
              <View key={pct} style={styles.milestoneRow}>
                <View style={styles.milestoneLeft}>
                  <View
                    style={[
                      styles.milestoneDot,
                      pct === 100 && { backgroundColor: colors.teal },
                    ]}
                  />
                  <Text style={styles.milestonePct}>{pct}%</Text>
                </View>
                <Text style={styles.milestoneVal}>
                  {milestoneValue}{selectedType.unit}
                </Text>
                <Text style={styles.milestoneDate}>{formatDate(milestoneDate)}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const STEP_LABELS = ['Type', 'Values', 'Deadline', 'Review'];

  return (
    <>
      <Stack.Screen options={{ title: 'New Goal', headerBackTitle: 'Back' }} />
      <View style={styles.container}>
        {renderStepIndicator()}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.bottomBar}>
          <Pressable style={styles.backBtn} onPress={goBack}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>
              {step === 1 ? 'Cancel' : 'Back'}
            </Text>
          </Pressable>

          {step < 4 ? (
            <Pressable
              style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
              onPress={goNext}
              disabled={!canProceed()}
            >
              <Text style={styles.nextBtnText}>Next</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.bgDeep} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.bgDeep} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color={colors.bgDeep} />
                  <Text style={styles.nextBtnText}>Create Goal</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Step indicator
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  stepDotActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  stepDotDone: {
    borderColor: colors.teal,
    backgroundColor: colors.teal,
  },
  stepNum: {
    ...typography.tiny,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  stepNumActive: {
    color: colors.teal,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  stepLineDone: {
    backgroundColor: colors.teal,
  },

  // Steps common
  stepContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  stepTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  stepSubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    marginBottom: 20,
  },

  // Step 1: Type cards
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeTextWrap: {
    flex: 1,
  },
  typeLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  typeDesc: {
    ...typography.small,
    color: colors.textSecondary,
    marginTop: 2,
  },
  typeExample: {
    ...typography.tiny,
    color: colors.textMuted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  typeCheck: {
    marginLeft: 8,
  },

  // Step 2: Value adjusters
  adjusterCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  adjusterLabel: {
    ...typography.small,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  adjusterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  adjusterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgDeep,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjusterValue: {
    ...typography.h1,
    color: colors.textPrimary,
    minWidth: 80,
    textAlign: 'center',
  },
  adjusterUnit: {
    ...typography.body,
    color: colors.textTertiary,
  },
  arrowIcon: {
    alignSelf: 'center',
    marginVertical: 12,
  },
  validationMsg: {
    ...typography.small,
    color: colors.warning,
    textAlign: 'center',
    marginTop: 12,
  },

  // Step 3: Deadline
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  deadlineCardActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  deadlineLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  deadlineLabelActive: {
    color: colors.teal,
  },
  deadlineDate: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Step 4: Review
  reviewCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  reviewIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  reviewTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  reviewDesc: {
    ...typography.small,
    color: colors.textTertiary,
    marginTop: 4,
    textAlign: 'center',
  },
  reviewDivider: {
    height: 1,
    backgroundColor: colors.border,
    alignSelf: 'stretch',
    marginVertical: 16,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 8,
  },
  reviewLabel: {
    ...typography.body,
    color: colors.textTertiary,
  },
  reviewValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  // Milestones
  milestonesCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  milestonesTitle: {
    ...typography.small,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  milestoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
  },
  milestoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
    marginRight: 8,
  },
  milestonePct: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  milestoneVal: {
    ...typography.small,
    color: colors.textPrimary,
    flex: 1,
  },
  milestoneDate: {
    ...typography.tiny,
    color: colors.textTertiary,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgDeep,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  backBtnText: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.teal,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radii.md,
    gap: 6,
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    ...typography.body,
    color: colors.bgDeep,
    fontWeight: '700',
  },
});
