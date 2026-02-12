import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Animated,
  Share,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radii } from '@/lib/theme';
import type { CelebrationEvent } from '@/lib/celebrations';

interface GoalCelebrationProps {
  visible: boolean;
  event: CelebrationEvent | null;
  onDismiss: () => void;
}

// Confetti particle positions (pre-computed for animation)
const CONFETTI_ITEMS = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  emoji: ['🎉', '🎊', '✨', '🌟', '⭐', '💫', '🏆', '🥇'][i % 8],
  left: Math.random() * 100,
  delay: Math.random() * 800,
}));

function ConfettiParticle({ emoji, left, delay }: { emoji: string; left: number; delay: number }) {
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 600,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.delay(1500),
          Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, translateY, opacity]);

  return (
    <Animated.Text
      style={[
        styles.confettiParticle,
        {
          left: `${left}%`,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

export default function GoalCelebration({ visible, event, onDismiss }: GoalCelebrationProps) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0.5);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim]);

  const handleShare = async () => {
    if (!event) return;
    const { stats, goal } = event;
    const message = `I just completed my goal "${goal.title}"! Started at ${stats.startingValue}, reached ${stats.targetValue} in ${stats.daysTaken} days. 🏆`;

    try {
      if (Platform.OS === 'web') {
        await Clipboard.setStringAsync(message);
      } else {
        await Share.share({ message });
      }
    } catch {
      // Fallback to clipboard
      await Clipboard.setStringAsync(message);
    }
  };

  if (!event) return null;

  const { stats, goal } = event;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        {/* Confetti */}
        {CONFETTI_ITEMS.map((item) => (
          <ConfettiParticle
            key={item.id}
            emoji={item.emoji}
            left={item.left}
            delay={item.delay}
          />
        ))}

        {/* Content card */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Trophy */}
          <Text style={styles.trophyEmoji}>🏆</Text>

          {/* Congratulations */}
          <Text style={styles.congratsTitle}>Congratulations!</Text>
          <Text style={styles.goalTitle}>
            You completed "{goal.title}"
          </Text>

          {/* Stats summary */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Started at</Text>
              <Text style={styles.statValue}>{stats.startingValue}</Text>
            </View>
            <View style={styles.statArrow}>
              <Ionicons name="arrow-forward" size={20} color={colors.teal} />
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Now at</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{stats.currentValue}</Text>
            </View>
            <View style={styles.statArrow}>
              <Ionicons name="time-outline" size={20} color={colors.textTertiary} />
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Took</Text>
              <Text style={styles.statValue}>{stats.daysTaken}d</Text>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <Pressable style={styles.shareButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={18} color={colors.teal} />
              <Text style={styles.shareButtonText}>Share</Text>
            </Pressable>
            <Pressable style={styles.dismissButton} onPress={onDismiss}>
              <Text style={styles.dismissButtonText}>Awesome!</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  confettiParticle: {
    position: 'absolute',
    top: -40,
    fontSize: 24,
  },
  card: {
    backgroundColor: colors.bgBase,
    borderRadius: radii['2xl'],
    padding: spacing['3xl'],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.tealBorder,
    width: '100%',
    maxWidth: 360,
  },
  trophyEmoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  congratsTitle: {
    ...typography.hero,
    color: colors.tealLight,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  goalTitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    width: '100%',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    ...typography.tiny,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: 2,
  },
  statArrow: {
    paddingHorizontal: spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.tealBorder,
  },
  shareButtonText: {
    ...typography.bodyMedium,
    color: colors.teal,
  },
  dismissButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
  },
  dismissButtonText: {
    ...typography.bodySemibold,
    color: '#ffffff',
  },
});
