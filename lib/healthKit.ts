/**
 * Apple HealthKit integration for sleep, HRV, steps, heart rate.
 * Requires dev build (won't work in Expo Go).
 * Gracefully degrades when unavailable.
 */
import { Platform } from 'react-native';

let HealthKit: any = null;

// Lazy-load to avoid Metro resolution failures in Expo Go
function getHealthKit() {
  if (HealthKit !== null) return HealthKit;
  if (Platform.OS !== 'ios') return null;
  try {
    // Dynamic require prevents Metro from statically resolving native modules
    const moduleName = '@kingstinct/react-native-healthkit';
    HealthKit = require(moduleName);
  } catch {
    console.log('HealthKit not available (Expo Go or web)');
    HealthKit = false; // Mark as attempted
  }
  return HealthKit || null;
}

export interface HealthSummary {
  available: boolean;
  sleep?: {
    lastNight: {
      duration_hours: number;
      inBed_hours: number;
      deepSleep_hours: number;
      remSleep_hours: number;
      quality: 'poor' | 'fair' | 'good' | 'excellent';
    } | null;
  };
  hrv?: {
    latest: number | null; // ms
    weekAvg: number | null;
    trend: 'improving' | 'stable' | 'declining' | 'unknown';
  };
  restingHeartRate?: {
    latest: number | null; // bpm
    weekAvg: number | null;
  };
  steps?: {
    today: number;
    weekAvg: number;
  };
  activeEnergy?: {
    today: number; // kcal
  };
  recoveryScore?: number; // 1-10 computed score
}

const HKQuantityTypeIdentifier = {
  stepCount: 'HKQuantityTypeIdentifierStepCount',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  heartRateVariabilitySDNN: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  restingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  activeEnergyBurned: 'HKQuantityTypeIdentifierActiveEnergyBurned',
};

const HKCategoryTypeIdentifier = {
  sleepAnalysis: 'HKCategoryTypeIdentifierSleepAnalysis',
};

export async function isHealthKitAvailable(): Promise<boolean> {
  if (!HealthKit) return false;
  try {
    const available = await HealthKit.isHealthDataAvailable();
    return available;
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  if (!HealthKit) return false;
  
  try {
    const permissions = {
      read: [
        HKQuantityTypeIdentifier.stepCount,
        HKQuantityTypeIdentifier.heartRate,
        HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
        HKQuantityTypeIdentifier.restingHeartRate,
        HKQuantityTypeIdentifier.activeEnergyBurned,
        HKCategoryTypeIdentifier.sleepAnalysis,
      ],
    };

    await HealthKit.requestAuthorization(permissions.read, []);
    return true;
  } catch (err) {
    console.error('HealthKit permission error:', err);
    return false;
  }
}

async function querySamples(typeId: string, startDate: Date, endDate: Date): Promise<any[]> {
  if (!HealthKit) return [];
  try {
    const samples = await HealthKit.queryQuantitySamples(typeId, {
      from: startDate.toISOString(),
      to: endDate.toISOString(),
    });
    return samples || [];
  } catch {
    return [];
  }
}

async function getSleepData(): Promise<HealthSummary['sleep']> {
  if (!HealthKit) return undefined;
  
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0); // Start from 6 PM yesterday
    
    const samples = await HealthKit.queryCategorySamples(
      HKCategoryTypeIdentifier.sleepAnalysis,
      { from: yesterday.toISOString(), to: now.toISOString() }
    );

    if (!samples || samples.length === 0) {
      return { lastNight: null };
    }

    let totalSleep = 0;
    let inBed = 0;
    let deepSleep = 0;
    let remSleep = 0;

    for (const sample of samples) {
      const duration = (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / 3600000;
      
      // HKCategoryValueSleepAnalysis values
      if (sample.value === 0) { // inBed
        inBed += duration;
      } else if (sample.value === 1) { // asleep (general)
        totalSleep += duration;
      } else if (sample.value === 3) { // asleep deep
        deepSleep += duration;
        totalSleep += duration;
      } else if (sample.value === 4) { // asleep REM
        remSleep += duration;
        totalSleep += duration;
      } else if (sample.value === 5) { // asleep core
        totalSleep += duration;
      }
    }

    const quality: 'poor' | 'fair' | 'good' | 'excellent' = 
      totalSleep < 5 ? 'poor' :
      totalSleep < 6.5 ? 'fair' :
      totalSleep < 7.5 ? 'good' : 'excellent';

    return {
      lastNight: {
        duration_hours: Math.round(totalSleep * 10) / 10,
        inBed_hours: Math.round(inBed * 10) / 10,
        deepSleep_hours: Math.round(deepSleep * 10) / 10,
        remSleep_hours: Math.round(remSleep * 10) / 10,
        quality,
      },
    };
  } catch (err) {
    console.error('Sleep data error:', err);
    return { lastNight: null };
  }
}

async function getHRVData(): Promise<HealthSummary['hrv']> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const samples = await querySamples(
    HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
    weekAgo,
    now,
  );

  if (samples.length === 0) {
    return { latest: null, weekAvg: null, trend: 'unknown' };
  }

  const values = samples.map((s: any) => s.quantity);
  const latest = values[values.length - 1];
  const weekAvg = values.reduce((a: number, b: number) => a + b, 0) / values.length;

  // Simple trend: compare last 3 days avg to previous 4 days
  const recentValues = values.slice(-3);
  const olderValues = values.slice(0, -3);
  
  let trend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
  if (recentValues.length > 0 && olderValues.length > 0) {
    const recentAvg = recentValues.reduce((a: number, b: number) => a + b, 0) / recentValues.length;
    const olderAvg = olderValues.reduce((a: number, b: number) => a + b, 0) / olderValues.length;
    const diff = (recentAvg - olderAvg) / olderAvg;
    trend = diff > 0.05 ? 'improving' : diff < -0.05 ? 'declining' : 'stable';
  }

  return {
    latest: Math.round(latest * 10) / 10,
    weekAvg: Math.round(weekAvg * 10) / 10,
    trend,
  };
}

async function getRestingHR(): Promise<HealthSummary['restingHeartRate']> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const samples = await querySamples(
    HKQuantityTypeIdentifier.restingHeartRate,
    weekAgo,
    now,
  );

  if (samples.length === 0) {
    return { latest: null, weekAvg: null };
  }

  const values = samples.map((s: any) => s.quantity);
  const latest = values[values.length - 1];
  const weekAvg = values.reduce((a: number, b: number) => a + b, 0) / values.length;

  return {
    latest: Math.round(latest),
    weekAvg: Math.round(weekAvg),
  };
}

async function getSteps(): Promise<HealthSummary['steps']> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todaySamples = await querySamples(
    HKQuantityTypeIdentifier.stepCount,
    todayStart,
    now,
  );

  const weekSamples = await querySamples(
    HKQuantityTypeIdentifier.stepCount,
    weekAgo,
    now,
  );

  const todaySteps = todaySamples.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
  const weekSteps = weekSamples.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);

  return {
    today: Math.round(todaySteps),
    weekAvg: Math.round(weekSteps / 7),
  };
}

function computeRecoveryScore(summary: Partial<HealthSummary>): number {
  let score = 5; // baseline

  // Sleep impact (±2)
  if (summary.sleep?.lastNight) {
    const hours = summary.sleep.lastNight.duration_hours;
    if (hours >= 7.5) score += 2;
    else if (hours >= 6.5) score += 1;
    else if (hours < 5) score -= 2;
    else if (hours < 6) score -= 1;
  }

  // HRV impact (±2)
  if (summary.hrv?.trend === 'improving') score += 1;
  if (summary.hrv?.trend === 'declining') score -= 1;
  if (summary.hrv?.latest && summary.hrv?.weekAvg) {
    if (summary.hrv.latest > summary.hrv.weekAvg * 1.1) score += 1;
    if (summary.hrv.latest < summary.hrv.weekAvg * 0.9) score -= 1;
  }

  // Resting HR impact (±1)
  if (summary.restingHeartRate?.latest && summary.restingHeartRate?.weekAvg) {
    if (summary.restingHeartRate.latest > summary.restingHeartRate.weekAvg + 5) score -= 1;
    if (summary.restingHeartRate.latest < summary.restingHeartRate.weekAvg - 3) score += 1;
  }

  return Math.max(1, Math.min(10, score));
}

export async function getHealthSummary(): Promise<HealthSummary> {
  const available = await isHealthKitAvailable();
  
  if (!available) {
    return { available: false };
  }

  const [sleep, hrv, restingHeartRate, steps] = await Promise.all([
    getSleepData(),
    getHRVData(),
    getRestingHR(),
    getSteps(),
  ]);

  const partial = { sleep, hrv, restingHeartRate, steps };
  const recoveryScore = computeRecoveryScore(partial);

  return {
    available: true,
    sleep,
    hrv,
    restingHeartRate,
    steps,
    recoveryScore,
  };
}
