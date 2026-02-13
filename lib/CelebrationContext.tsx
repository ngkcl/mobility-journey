/**
 * CelebrationContext.tsx — Global celebration state manager
 *
 * Provides a context that any screen can use to trigger celebrations
 * when goals hit milestones. Renders MilestoneToast and GoalCelebration
 * at the app root level so they overlay everything.
 *
 * Usage:
 *   const { checkAndCelebrate } = useCelebration();
 *   // After updating a metric:
 *   const updatedGoals = await trackMetricUpdate('pain_level', 4);
 *   checkAndCelebrate(updatedGoals, previousValues);
 */

import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import MilestoneToast from '@/components/MilestoneToast';
import GoalCelebration from '@/components/GoalCelebration';
import {
  checkMilestones,
  shouldCelebrate,
  type MilestoneHit,
  type MilestoneLevel,
  type CelebrationEvent,
} from './celebrations';
import { checkAndAwardBadges } from './badges';
import type { Goal } from './goals';

interface CelebrationContextValue {
  /**
   * Check a list of updated goals for milestone crossings and trigger celebrations.
   * Pass previousValues as a map of goalId → previous current_value.
   */
  checkAndCelebrate: (updatedGoals: Goal[], previousValues: Record<string, number>) => void;

  /**
   * Manually trigger a milestone toast (e.g., from goal detail screen).
   */
  showMilestoneToast: (level: MilestoneLevel, goalTitle: string) => void;

  /**
   * Manually trigger a full celebration modal.
   */
  showCelebration: (event: CelebrationEvent) => void;
}

const CelebrationContext = createContext<CelebrationContextValue>({
  checkAndCelebrate: () => {},
  showMilestoneToast: () => {},
  showCelebration: () => {},
});

export function useCelebration() {
  return useContext(CelebrationContext);
}

interface Props {
  children: ReactNode;
}

export function CelebrationProvider({ children }: Props) {
  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastLevel, setToastLevel] = useState<MilestoneLevel | null>(null);
  const [toastGoalTitle, setToastGoalTitle] = useState('');

  // Full celebration modal state
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [celebrationEvent, setCelebrationEvent] = useState<CelebrationEvent | null>(null);

  // Queue for multiple celebrations (process one at a time)
  const [celebrationQueue, setCelebrationQueue] = useState<
    Array<{ type: 'toast'; level: MilestoneLevel; title: string } | { type: 'full'; event: CelebrationEvent }>
  >([]);

  const processNext = useCallback(
    (queue: typeof celebrationQueue) => {
      if (queue.length === 0) return;
      const next = queue[0];
      const remaining = queue.slice(1);
      setCelebrationQueue(remaining);

      if (next.type === 'toast') {
        setToastLevel(next.level);
        setToastGoalTitle(next.title);
        setToastVisible(true);
      } else {
        setCelebrationEvent(next.event);
        setCelebrationVisible(true);
      }
    },
    [],
  );

  const showMilestoneToast = useCallback((level: MilestoneLevel, goalTitle: string) => {
    setToastLevel(level);
    setToastGoalTitle(goalTitle);
    setToastVisible(true);
  }, []);

  const showCelebration = useCallback((event: CelebrationEvent) => {
    setCelebrationEvent(event);
    setCelebrationVisible(true);
  }, []);

  const checkAndCelebrate = useCallback(
    (updatedGoals: Goal[], previousValues: Record<string, number>) => {
      const items: typeof celebrationQueue = [];

      for (const goal of updatedGoals) {
        const prevValue = previousValues[goal.id];
        if (prevValue === undefined) continue;

        // Check for milestone crossing
        const hit = checkMilestones(goal, prevValue, goal.current_value);

        if (hit) {
          if (hit.level === 100) {
            // Full celebration for goal completion
            const celebEvent = shouldCelebrate(goal);
            if (celebEvent) {
              items.push({ type: 'full', event: celebEvent });
              // Award badges async (fire and forget)
              checkAndAwardBadges([goal]).catch(console.error);
            }
          } else {
            // Toast for 25/50/75% milestones
            items.push({ type: 'toast', level: hit.level, title: goal.title });
          }
        }
      }

      if (items.length === 0) return;

      // Show first immediately, queue the rest
      const [first, ...rest] = items;
      setCelebrationQueue(rest);

      if (first.type === 'toast') {
        setToastLevel(first.level);
        setToastGoalTitle(first.title);
        setToastVisible(true);
      } else {
        setCelebrationEvent(first.event);
        setCelebrationVisible(true);
      }
    },
    [],
  );

  const handleToastDismiss = useCallback(() => {
    setToastVisible(false);
    // Process next in queue after a short delay
    setTimeout(() => {
      setCelebrationQueue((prev) => {
        if (prev.length > 0) processNext(prev);
        return prev;
      });
    }, 500);
  }, [processNext]);

  const handleCelebrationDismiss = useCallback(() => {
    setCelebrationVisible(false);
    // Process next in queue after a short delay
    setTimeout(() => {
      setCelebrationQueue((prev) => {
        if (prev.length > 0) processNext(prev);
        return prev;
      });
    }, 500);
  }, [processNext]);

  return (
    <CelebrationContext.Provider value={{ checkAndCelebrate, showMilestoneToast, showCelebration }}>
      {children}
      <MilestoneToast
        visible={toastVisible}
        level={toastLevel}
        goalTitle={toastGoalTitle}
        onDismiss={handleToastDismiss}
      />
      <GoalCelebration
        visible={celebrationVisible}
        event={celebrationEvent}
        onDismiss={handleCelebrationDismiss}
      />
    </CelebrationContext.Provider>
  );
}
