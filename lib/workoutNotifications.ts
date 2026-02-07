import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  DAY_ORDER,
  SESSION_LABELS,
  type ScheduleDayKey,
  type ScheduleSessionKey,
  type WorkoutSchedule,
} from './workoutSchedule';

const WORKOUT_NOTIFICATION_IDS_KEY = 'workout_schedule_notifications_v1';

const WEEKDAY_NUMBER: Record<ScheduleDayKey, number> = {
  sunday: 1,
  monday: 2,
  tuesday: 3,
  wednesday: 4,
  thursday: 5,
  friday: 6,
  saturday: 7,
};

const parseTime = (time: string) => {
  const [hour, minute] = time.split(':').map((value) => Number(value));
  return { hour, minute };
};

const shiftTime = (hour: number, minute: number, deltaMinutes: number) => {
  let totalMinutes = hour * 60 + minute + deltaMinutes;
  let dayDelta = 0;

  while (totalMinutes < 0) {
    totalMinutes += 1440;
    dayDelta -= 1;
  }

  while (totalMinutes >= 1440) {
    totalMinutes -= 1440;
    dayDelta += 1;
  }

  return {
    hour: Math.floor(totalMinutes / 60),
    minute: totalMinutes % 60,
    dayDelta,
  };
};

const shiftWeekday = (weekday: number, dayDelta: number) => {
  let adjusted = weekday + dayDelta;
  while (adjusted < 1) adjusted += 7;
  while (adjusted > 7) adjusted -= 7;
  return adjusted;
};

const ensureNotificationChannel = async () => {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('workout-reminders', {
    name: 'Workout Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#14b8a6',
  });
};

export const cancelWorkoutNotifications = async () => {
  try {
    const raw = await AsyncStorage.getItem(WORKOUT_NOTIFICATION_IDS_KEY);
    if (!raw) return;
    const ids = JSON.parse(raw) as string[];
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    await AsyncStorage.removeItem(WORKOUT_NOTIFICATION_IDS_KEY);
  } catch (error) {
    // Ignore failures; schedule sync can recover.
  }
};

export const scheduleWorkoutNotifications = async (schedule: WorkoutSchedule) => {
  await cancelWorkoutNotifications();

  if (!schedule.notificationsEnabled) return [];

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== Notifications.PermissionStatus.GRANTED) return [];

  await ensureNotificationChannel();

  const schedulePromises: Promise<string>[] = [];

  DAY_ORDER.forEach((dayKey) => {
    if (!schedule.correctiveDays[dayKey]) return;

    const baseWeekday = WEEKDAY_NUMBER[dayKey];

    (Object.keys(schedule.sessions) as ScheduleSessionKey[]).forEach((sessionKey) => {
      const sessionTime = schedule.sessions[sessionKey];
      const { hour, minute } = parseTime(sessionTime);
      const reminderTime = shiftTime(hour, minute, -20);
      const checkinTime = shiftTime(hour, minute, 30);

      const reminderWeekday = shiftWeekday(baseWeekday, reminderTime.dayDelta);
      const checkinWeekday = shiftWeekday(baseWeekday, checkinTime.dayDelta);

      schedulePromises.push(
        Notifications.scheduleNotificationAsync({
          content: {
            title: `${SESSION_LABELS[sessionKey]} corrective soon`,
            body: 'Starts in 20 minutes. Prep a quick reset for your scoliosis protocol.',
            data: {
              kind: 'reminder',
              session: sessionKey,
              day: dayKey,
            },
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: reminderWeekday,
            hour: reminderTime.hour,
            minute: reminderTime.minute,
            channelId: 'workout-reminders',
          },
        }),
      );

      schedulePromises.push(
        Notifications.scheduleNotificationAsync({
          content: {
            title: `${SESSION_LABELS[sessionKey]} check-in`,
            body: "If you haven't logged it yet, tap to note completion or adjust.",
            data: {
              kind: 'checkin',
              session: sessionKey,
              day: dayKey,
            },
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: checkinWeekday,
            hour: checkinTime.hour,
            minute: checkinTime.minute,
            channelId: 'workout-reminders',
          },
        }),
      );
    });
  });

  const resolvedIds = await Promise.all(schedulePromises);
  await AsyncStorage.setItem(WORKOUT_NOTIFICATION_IDS_KEY, JSON.stringify(resolvedIds));
  return resolvedIds;
};
