import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Pressable } from 'react-native';
import { colors, typography, spacing, radii } from '@/lib/theme';
import { type MilestoneLevel, getMilestoneMessage } from '@/lib/celebrations';

interface MilestoneToastProps {
  visible: boolean;
  level: MilestoneLevel | null;
  goalTitle: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;

export default function MilestoneToast({ visible, level, goalTitle, onDismiss }: MilestoneToastProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && level) {
      // Slide in
      translateY.setValue(-100);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(onDismiss);
      }, AUTO_DISMISS_MS);

      return () => clearTimeout(timer);
    }
  }, [visible, level, translateY, opacity, onDismiss]);

  if (!visible || !level) return null;

  const { emoji, message } = getMilestoneMessage(level);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Pressable style={styles.inner} onPress={onDismiss}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.message} numberOfLines={2}>
          <Text style={styles.bold}>{message}</Text>
          {'\n'}
          <Text style={styles.goalName}>{goalTitle}</Text>
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10000,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgBase,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.tealBorder,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  emoji: {
    fontSize: 28,
  },
  message: {
    flex: 1,
  },
  bold: {
    ...typography.bodySemibold,
    color: colors.tealLight,
  },
  goalName: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
