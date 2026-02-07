import AsyncStorage from '@react-native-async-storage/async-storage';

export type PostureSettings = {
  thresholdDeg: number;
  alertDelaySec: number;
  hapticsEnabled: boolean;
  soundEnabled: boolean;
};

export const POSTURE_SETTINGS_KEY = 'posture_settings_v1';

export const DEFAULT_POSTURE_SETTINGS: PostureSettings = {
  thresholdDeg: 15,
  alertDelaySec: 5,
  hapticsEnabled: true,
  soundEnabled: false,
};

const THRESHOLD_RANGE = { min: 5, max: 30 };
const ALERT_DELAY_RANGE = { min: 3, max: 20 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toFiniteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export const normalizePostureSettings = (
  input: Partial<PostureSettings> | null | undefined,
): PostureSettings => {
  const thresholdValue = toFiniteNumber(input?.thresholdDeg);
  const alertDelayValue = toFiniteNumber(input?.alertDelaySec);

  return {
    thresholdDeg: clamp(
      thresholdValue ?? DEFAULT_POSTURE_SETTINGS.thresholdDeg,
      THRESHOLD_RANGE.min,
      THRESHOLD_RANGE.max,
    ),
    alertDelaySec: clamp(
      alertDelayValue ?? DEFAULT_POSTURE_SETTINGS.alertDelaySec,
      ALERT_DELAY_RANGE.min,
      ALERT_DELAY_RANGE.max,
    ),
    hapticsEnabled: toBoolean(
      input?.hapticsEnabled,
      DEFAULT_POSTURE_SETTINGS.hapticsEnabled,
    ),
    soundEnabled: toBoolean(
      input?.soundEnabled,
      DEFAULT_POSTURE_SETTINGS.soundEnabled,
    ),
  };
};

export const loadPostureSettings = async (): Promise<PostureSettings> => {
  try {
    const raw = await AsyncStorage.getItem(POSTURE_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_POSTURE_SETTINGS;
    }

    const parsed = JSON.parse(raw);
    return normalizePostureSettings(parsed);
  } catch (error) {
    return DEFAULT_POSTURE_SETTINGS;
  }
};

export const savePostureSettings = async (settings: PostureSettings) => {
  try {
    const normalized = normalizePostureSettings(settings);
    await AsyncStorage.setItem(
      POSTURE_SETTINGS_KEY,
      JSON.stringify(normalized),
    );
  } catch (error) {
    // Ignore persistence errors so posture monitoring still works offline.
  }
};

export const POSTURE_SETTINGS_LIMITS = {
  threshold: THRESHOLD_RANGE,
  alertDelay: ALERT_DELAY_RANGE,
};
