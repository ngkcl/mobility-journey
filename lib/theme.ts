/**
 * Mobility Journey — Design System
 *
 * Single source of truth for colors, typography, spacing, and shared styles.
 * Every screen should import from here instead of hard-coding hex values.
 */
import { StyleSheet, Dimensions, Platform } from 'react-native';

// ─── Color Palette ────────────────────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bgDeep: '#0b1020',
  bgBase: '#0f172a',
  bgCard: '#1e293b',
  bgCardAlt: 'rgba(30, 41, 59, 0.7)',
  bgElevated: '#0f172a',
  bgOverlay: 'rgba(15, 23, 42, 0.8)',

  // Accent
  teal: '#14b8a6',
  tealLight: '#5eead4',
  tealDim: 'rgba(20, 184, 166, 0.15)',
  tealBorder: 'rgba(20, 184, 166, 0.3)',

  // Text
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textTertiary: '#94a3b8',
  textMuted: '#64748b',
  textPlaceholder: '#475569',

  // Borders
  border: 'rgba(51, 65, 85, 0.6)',
  borderLight: 'rgba(51, 65, 85, 0.3)',
  borderAccent: 'rgba(20, 184, 166, 0.4)',

  // Status colors
  success: '#22c55e',
  successDim: 'rgba(34, 197, 94, 0.15)',
  warning: '#f59e0b',
  warningDim: 'rgba(245, 158, 11, 0.15)',
  error: '#ef4444',
  errorDim: 'rgba(239, 68, 68, 0.15)',
  info: '#3b82f6',
  infoDim: 'rgba(59, 130, 246, 0.15)',

  // Session badges
  morning: '#f59e0b',
  morningDim: 'rgba(245, 158, 11, 0.15)',
  morningBorder: 'rgba(245, 158, 11, 0.3)',
  midday: '#3b82f6',
  middayDim: 'rgba(59, 130, 246, 0.15)',
  middayBorder: 'rgba(59, 130, 246, 0.3)',
  evening: '#a855f7',
  eveningDim: 'rgba(168, 85, 247, 0.15)',
  eveningBorder: 'rgba(168, 85, 247, 0.3)',

  // Side indicators
  leftSide: '#3b82f6',
  leftSideDim: 'rgba(59, 130, 246, 0.15)',
  rightSide: '#f97316',
  rightSideDim: 'rgba(249, 115, 22, 0.15)',

  // Metric colors
  pain: '#f43f5e',
  posture: '#14b8a6',
  symmetry: '#8b5cf6',
  energy: '#f59e0b',

  // Category colors
  corrective: { bg: 'rgba(20, 184, 166, 0.15)', text: '#5eead4', border: 'rgba(20, 184, 166, 0.3)' },
  stretching: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.3)' },
  strengthening: { bg: 'rgba(34, 197, 94, 0.15)', text: '#86efac', border: 'rgba(34, 197, 94, 0.3)' },
  warmup: { bg: 'rgba(56, 189, 248, 0.15)', text: '#7dd3fc', border: 'rgba(56, 189, 248, 0.3)' },
  cooldown: { bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' },
  gym_compound: { bg: 'rgba(99, 102, 241, 0.15)', text: '#a5b4fc', border: 'rgba(99, 102, 241, 0.3)' },
  gym_isolation: { bg: 'rgba(168, 85, 247, 0.15)', text: '#c4b5fd', border: 'rgba(168, 85, 247, 0.3)' },
  cardio: { bg: 'rgba(244, 63, 94, 0.15)', text: '#fda4af', border: 'rgba(244, 63, 94, 0.3)' },
  mobility: { bg: 'rgba(34, 211, 238, 0.15)', text: '#67e8f9', border: 'rgba(34, 211, 238, 0.3)' },

  // Tab bar
  tabBarBg: '#020617',
  tabBarBorder: 'rgba(51, 65, 85, 0.5)',
  tabBarActive: '#14b8a6',
  tabBarInactive: '#94a3b8',
} as const;

// ─── Typography Scale ─────────────────────────────────────────────────────────

export const typography = {
  hero: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.2 },
  h3: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '500' as const },
  bodySemibold: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  captionMedium: { fontSize: 13, fontWeight: '500' as const },
  small: { fontSize: 11, fontWeight: '500' as const },
  tiny: { fontSize: 10, fontWeight: '600' as const },
} as const;

// ─── Spacing Scale ────────────────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

// ─── Screen Dimensions ────────────────────────────────────────────────────────

export const screen = {
  width: Dimensions.get('window').width,
  padding: 16,
  contentWidth: Dimensions.get('window').width - 32,
} as const;

// ─── Shared StyleSheet ────────────────────────────────────────────────────────

export const shared = StyleSheet.create({
  // Layout
  screen: {
    flex: 1,
    backgroundColor: colors.bgDeep,
  },
  screenContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },

  // Cards
  card: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAccent: {
    backgroundColor: colors.tealDim,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  cardElevated: {
    backgroundColor: colors.bgCardAlt,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Page headers
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Buttons
  btnPrimary: {
    backgroundColor: colors.teal,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  btnPrimaryText: {
    ...typography.bodySemibold,
    color: '#ffffff',
  },
  btnSecondary: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  btnSecondaryText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  btnSmall: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.md,
  },

  // Badges
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    ...typography.small,
  },

  // Form inputs
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },

  // Empty states
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['4xl'],
  },
  emptyStateTitle: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  emptyStateText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },

  // Row helpers
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gap4: { gap: spacing.xs },
  gap8: { gap: spacing.sm },
  gap12: { gap: spacing.md },
  gap16: { gap: spacing.lg },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get time-of-day greeting */
export const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

/** Daily motivational tips */
const DAILY_TIPS = [
  '💡 Consistency beats intensity. Small daily improvements compound.',
  '🧘 Remember: posture correction is a marathon, not a sprint.',
  '💪 Your body adapts to what you practice most frequently.',
  '🎯 Focus on the weak side — that\'s where the biggest gains are.',
  '🔄 Tight muscles first, then strengthen the weak ones.',
  '⚡ Even 5 minutes of corrective work is better than skipping the session.',
  '🌊 Movement is medicine. Every rep counts toward better alignment.',
  '🧠 Mind-muscle connection matters. Feel each stretch, don\'t rush.',
  '🏗️ Build the foundation first — core stability enables everything else.',
  '📸 Take progress photos weekly. You won\'t notice changes day-to-day.',
  '⏰ Your morning session sets the tone. Don\'t skip it.',
  '🔥 Embrace the discomfort — that\'s your body rewiring itself.',
  '📊 Track everything. What gets measured gets improved.',
  '🛌 Recovery is part of the program. Sleep well tonight.',
];

export const getDailyTip = (): string => {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return DAILY_TIPS[dayOfYear % DAILY_TIPS.length];
};

/** Session type color mapping */
export const getSessionColors = (
  type: 'morning' | 'midday' | 'evening' | string,
): { bg: string; text: string; border: string; label: string } => {
  switch (type) {
    case 'morning':
      return { bg: colors.morningDim, text: colors.morning, border: colors.morningBorder, label: '🌅 Morning' };
    case 'midday':
    case 'afternoon':
      return { bg: colors.middayDim, text: colors.midday, border: colors.middayBorder, label: '☀️ Midday' };
    case 'evening':
      return { bg: colors.eveningDim, text: colors.evening, border: colors.eveningBorder, label: '🌙 Evening' };
    default:
      return { bg: colors.tealDim, text: colors.tealLight, border: colors.tealBorder, label: type };
  }
};

/** Side indicator colors */
export const getSideColor = (side: string): { bg: string; text: string; label: string } => {
  switch (side) {
    case 'left':
      return { bg: colors.leftSideDim, text: '#60a5fa', label: 'L' };
    case 'right':
      return { bg: colors.rightSideDim, text: '#fb923c', label: 'R' };
    default:
      return { bg: colors.tealDim, text: colors.tealLight, label: 'B' };
  }
};

/** Format estimated duration from exercises */
export const estimateSessionDuration = (exerciseCount: number, avgSecondsPerExercise = 90): string => {
  const minutes = Math.ceil((exerciseCount * avgSecondsPerExercise) / 60);
  if (minutes < 1) return '< 1 min';
  return `~${minutes} min`;
};
