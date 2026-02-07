import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addDays, format } from 'date-fns';
import * as Notifications from 'expo-notifications';
import LoadingState from '../components/LoadingState';
import { useToast } from '../components/Toast';
import { getSupabase } from '../lib/supabase';
import type { Workout, WorkoutType } from '../lib/types';
import {
  DAY_LABELS,
  DAY_ORDER,
  DEFAULT_WORKOUT_SCHEDULE,
  SESSION_LABELS,
  getDayKey,
  loadWorkoutSchedule,
  normalizeWorkoutSchedule,
  saveWorkoutSchedule,
  type ScheduleDayKey,
  type ScheduleSessionKey,
  type WorkoutSchedule,
} from '../lib/workoutSchedule';
import { cancelWorkoutNotifications, scheduleWorkoutNotifications } from '../lib/workoutNotifications';

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

const buildCalendarDays = (start: Date, count: number) =>
  Array.from({ length: count }, (_, index) => addDays(start, index));

const buildWorkoutTotals = (workouts: Workout[]) => {
  const map = new Map<string, Record<WorkoutType, number>>();
  workouts.forEach((workout) => {
    const entry = map.get(workout.date) ?? {
      corrective: 0,
      gym: 0,
      cardio: 0,
      other: 0,
    };
    entry[workout.type] = entry[workout.type] + 1;
    map.set(workout.date, entry);
  });
  return map;
};

export default function WorkoutScheduleScreen() {
  const { pushToast } = useToast();
  const [schedule, setSchedule] = useState<WorkoutSchedule>(DEFAULT_WORKOUT_SCHEDULE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus>(
    Notifications.PermissionStatus.UNDETERMINED,
  );
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadSchedule = async () => {
    const stored = await loadWorkoutSchedule();
    setSchedule(stored);
  };

  const loadPermissionStatus = async () => {
    const permissions = await Notifications.getPermissionsAsync();
    setPermissionStatus(permissions.status);
  };

  const loadWorkoutHistory = async () => {
    const supabase = getSupabase();
    const startDate = toDateKey(addDays(new Date(), -7));
    const { data, error } = await supabase
      .from('workouts')
      .select('*')
      .gte('date', startDate)
      .order('date', { ascending: false });

    if (error) {
      pushToast('Failed to load workout history.', 'error');
      return;
    }

    setWorkouts((data ?? []) as Workout[]);
  };

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([loadSchedule(), loadPermissionStatus(), loadWorkoutHistory()]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const updateSessionTime = (session: ScheduleSessionKey, value: string) => {
    setSchedule((prev) => ({
      ...prev,
      sessions: {
        ...prev.sessions,
        [session]: value,
      },
    }));
  };

  const updateCorrectiveDay = (day: ScheduleDayKey, enabled: boolean) => {
    setSchedule((prev) => ({
      ...prev,
      correctiveDays: {
        ...prev.correctiveDays,
        [day]: enabled,
      },
    }));
  };

  const updateGymDay = (day: ScheduleDayKey, enabled: boolean) => {
    setSchedule((prev) => ({
      ...prev,
      gymDays: {
        ...prev.gymDays,
        [day]: enabled,
      },
    }));
  };

  const updateNotificationsEnabled = (enabled: boolean) => {
    setSchedule((prev) => ({
      ...prev,
      notificationsEnabled: enabled,
    }));
  };

  const requestPermissions = async () => {
    const permissions = await Notifications.requestPermissionsAsync();
    setPermissionStatus(permissions.status);

    if (permissions.status !== 'granted') {
      pushToast('Notifications are not enabled yet.', 'error');
    } else {
      pushToast('Notifications enabled.', 'success');
    }
  };

  const saveSchedule = async () => {
    setIsSaving(true);
    const normalized = normalizeWorkoutSchedule(schedule);
    setSchedule(normalized);
    await saveWorkoutSchedule(normalized);

    if (normalized.notificationsEnabled) {
      const ids = await scheduleWorkoutNotifications(normalized);
      if (ids.length === 0) {
        pushToast('Reminders saved but not scheduled. Check permissions.', 'error');
      } else {
        pushToast('Reminders synced.', 'success');
      }
    } else {
      await cancelWorkoutNotifications();
      pushToast('Reminders paused.', 'success');
    }

    setIsSaving(false);
  };

  const workoutsByDate = useMemo(() => buildWorkoutTotals(workouts), [workouts]);
  const today = useMemo(() => new Date(), []);
  const calendarStart = useMemo(() => addDays(today, -6), [today]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarStart, 14), [calendarStart]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#0b1020] p-6">
        <LoadingState label="Loading workout schedule..." />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#0b1020]"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5eead4" />}
    >
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-semibold text-white">Workout Schedule</Text>
          <Text className="text-slate-400 text-sm">
            Plan corrective sessions and gym days with reminders.
          </Text>
        </View>
      </View>

      <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70 mb-6">
        <Text className="text-lg font-semibold text-white">Notifications</Text>
        <Text className="text-slate-400 text-xs mt-1">
          Reminders fire 20 minutes before each corrective session. Check-ins fire 30 minutes after.
        </Text>
        <View className="flex-row items-center justify-between mt-4">
          <Text className="text-slate-200 text-sm">Enable reminders</Text>
          <Switch
            value={schedule.notificationsEnabled}
            onValueChange={updateNotificationsEnabled}
            thumbColor={schedule.notificationsEnabled ? '#14b8a6' : '#475569'}
            trackColor={{ false: '#1e293b', true: '#0f766e' }}
          />
        </View>
        <View className="flex-row items-center justify-between mt-3">
          <Text className="text-xs text-slate-500">
            Permission status: {permissionStatus === 'granted' ? 'Granted' : 'Needs action'}
          </Text>
          <Pressable onPress={requestPermissions} className="px-3 py-2 rounded-lg bg-slate-800">
            <Text className="text-slate-200 text-xs">Request</Text>
          </Pressable>
        </View>
      </View>

      <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70 mb-6">
        <Text className="text-lg font-semibold text-white">Session Times</Text>
        <Text className="text-slate-400 text-xs mt-1">Use 24-hour time (HH:MM).</Text>
        <View className="flex-row gap-3 mt-4">
          {(Object.keys(schedule.sessions) as ScheduleSessionKey[]).map((session) => (
            <View key={session} className="flex-1">
              <Text className="text-xs text-slate-400 mb-1">{SESSION_LABELS[session]}</Text>
              <TextInput
                value={schedule.sessions[session]}
                onChangeText={(value) => updateSessionTime(session, value)}
                placeholder="09:00"
                placeholderTextColor="#475569"
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm"
              />
            </View>
          ))}
        </View>
      </View>

      <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70 mb-6">
        <Text className="text-lg font-semibold text-white">Weekly Schedule</Text>
        <Text className="text-slate-400 text-xs mt-1">Choose corrective days and gym days.</Text>
        <View className="mt-4 gap-3">
          {DAY_ORDER.map((day) => (
            <View
              key={day}
              className="flex-row items-center justify-between bg-slate-950/70 border border-slate-800/70 rounded-xl px-3 py-3"
            >
              <Text className="text-slate-200 text-sm font-medium">{DAY_LABELS[day]}</Text>
              <View className="flex-row items-center gap-4">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-slate-400">Corrective</Text>
                  <Switch
                    value={schedule.correctiveDays[day]}
                    onValueChange={(value) => updateCorrectiveDay(day, value)}
                    thumbColor={schedule.correctiveDays[day] ? '#14b8a6' : '#475569'}
                    trackColor={{ false: '#1e293b', true: '#0f766e' }}
                  />
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-slate-400">Gym</Text>
                  <Switch
                    value={schedule.gymDays[day]}
                    onValueChange={(value) => updateGymDay(day, value)}
                    thumbColor={schedule.gymDays[day] ? '#6366f1' : '#475569'}
                    trackColor={{ false: '#1e293b', true: '#312e81' }}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={saveSchedule}
          className="mt-5 bg-teal-500 px-4 py-2.5 rounded-xl items-center"
          disabled={isSaving}
        >
          <Text className="text-white font-medium">{isSaving ? 'Saving...' : 'Save and Sync'}</Text>
        </Pressable>
      </View>

      <View className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/70">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-lg font-semibold text-white">Calendar Preview</Text>
          <Ionicons name="calendar" size={18} color="#94a3b8" />
        </View>
        <Text className="text-slate-400 text-xs mb-4">Scheduled vs completed sessions.</Text>
        <View className="gap-3">
          {calendarDays.map((date) => {
            const dayKey = getDayKey(date);
            const dateKey = toDateKey(date);
            const totals = workoutsByDate.get(dateKey);
            const scheduledCorrective = schedule.correctiveDays[dayKey] ? 3 : 0;
            const completedCorrective = Math.min(totals?.corrective ?? 0, scheduledCorrective);
            const gymScheduled = schedule.gymDays[dayKey];
            const gymCompleted = (totals?.gym ?? 0) > 0;
            const isToday = dateKey === toDateKey(today);

            return (
              <View
                key={dateKey}
                className="bg-slate-950/70 rounded-xl border border-slate-800/70 px-4 py-3"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-white font-medium">
                    {format(date, 'EEE, MMM d')}
                    {isToday ? ' (Today)' : ''}
                  </Text>
                  <Text className="text-xs text-slate-500">{DAY_LABELS[dayKey]}</Text>
                </View>
                <View className="flex-row flex-wrap gap-2 mt-2">
                  {scheduledCorrective > 0 ? (
                    <View className="px-2 py-1 rounded-full bg-teal-500/20">
                      <Text className="text-xs text-teal-200">
                        Corrective {completedCorrective}/{scheduledCorrective}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-xs text-slate-500">No corrective sessions</Text>
                  )}
                  {gymScheduled && (
                    <View className={`px-2 py-1 rounded-full ${gymCompleted ? 'bg-indigo-500/20' : 'bg-slate-800'}`}>
                      <Text className={`text-xs ${gymCompleted ? 'text-indigo-200' : 'text-slate-300'}`}>
                        Gym {gymCompleted ? 'done' : 'planned'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
