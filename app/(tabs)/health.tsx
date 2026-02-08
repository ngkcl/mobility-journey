import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getHealthSummary, isHealthKitAvailable, requestHealthPermissions, type HealthSummary } from '../../lib/healthKit';
import { getEightSleepData, type EightSleepData } from '../../lib/eightSleep';

const COLORS = {
  bg: '#0b1020',
  card: '#0f172a',
  border: 'rgba(51,65,85,0.5)',
  teal: '#14b8a6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#a78bfa',
  blue: '#3b82f6',
  white: '#ffffff',
  muted: '#94a3b8',
  dim: '#64748b',
};

function ScoreRing({ score, maxScore = 10, size = 120, label }: { score: number; maxScore?: number; size?: number; label: string }) {
  const pct = Math.min(score / maxScore, 1);
  const color = pct >= 0.7 ? COLORS.green : pct >= 0.4 ? COLORS.amber : COLORS.red;
  
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 6, borderColor: 'rgba(51,65,85,0.3)',
        justifyContent: 'center', alignItems: 'center',
      }}>
        <View style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2,
          borderWidth: 6, borderColor: color, borderTopColor: 'transparent',
          transform: [{ rotate: `${pct * 360}deg` }],
        }} />
        <Text style={{ color: COLORS.white, fontSize: size * 0.3, fontWeight: '700' }}>
          {score}
        </Text>
        <Text style={{ color: COLORS.muted, fontSize: size * 0.12 }}>/{maxScore}</Text>
      </View>
      <Text style={{ color: COLORS.muted, fontSize: 14, marginTop: 8 }}>{label}</Text>
    </View>
  );
}

function StatCard({ icon, label, value, unit, color, subtitle }: {
  icon: string; label: string; value: string | number; unit?: string; color: string; subtitle?: string;
}) {
  return (
    <View style={{
      backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
      borderWidth: 1, borderColor: COLORS.border, flex: 1, minWidth: 140,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Ionicons name={icon as any} size={18} color={color} />
        <Text style={{ color: COLORS.muted, fontSize: 12, marginLeft: 6 }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '700' }}>{value}</Text>
        {unit && <Text style={{ color: COLORS.dim, fontSize: 14, marginLeft: 4 }}>{unit}</Text>}
      </View>
      {subtitle && <Text style={{ color: COLORS.dim, fontSize: 12, marginTop: 4 }}>{subtitle}</Text>}
    </View>
  );
}

function SleepBar({ label, hours, maxHours = 10, color }: { label: string; hours: number; maxHours?: number; color: string }) {
  const pct = Math.min(hours / maxHours, 1) * 100;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: COLORS.muted, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: COLORS.white, fontSize: 13, fontWeight: '600' }}>{hours.toFixed(1)}h</Text>
      </View>
      <View style={{ height: 8, backgroundColor: 'rgba(51,65,85,0.3)', borderRadius: 4 }}>
        <View style={{ height: 8, backgroundColor: color, borderRadius: 4, width: `${pct}%` }} />
      </View>
    </View>
  );
}

export default function HealthScreen() {
  const [healthKit, setHealthKit] = useState<HealthSummary>({ available: false });
  const [eightSleep, setEightSleep] = useState<EightSleepData>({ available: false });
  const [refreshing, setRefreshing] = useState(false);
  const [healthKitEnabled, setHealthKitEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [hk, es] = await Promise.all([
      getHealthSummary().catch(() => ({ available: false } as HealthSummary)),
      getEightSleepData().catch(() => ({ available: false } as EightSleepData)),
    ]);
    setHealthKit(hk);
    setEightSleep(es);
    setHealthKitEnabled(hk.available);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleEnableHealthKit = async () => {
    const available = await isHealthKitAvailable();
    if (!available) {
      // Not available in Expo Go
      return;
    }
    const granted = await requestHealthPermissions();
    if (granted) {
      setHealthKitEnabled(true);
      await fetchData();
    }
  };

  // Determine best sleep source
  const sleepSource = eightSleep.available && eightSleep.lastNight 
    ? 'eight_sleep' 
    : healthKit.available && healthKit.sleep?.lastNight 
      ? 'apple_health' 
      : null;

  // Compute combined recovery score
  const recoveryScore = eightSleep.available && eightSleep.recoveryScore
    ? eightSleep.recoveryScore
    : healthKit.recoveryScore ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.teal} />}
    >
      {/* Header */}
      <Text style={{ color: COLORS.white, fontSize: 28, fontWeight: '700', marginBottom: 4 }}>
        Health & Recovery
      </Text>
      <Text style={{ color: COLORS.muted, fontSize: 14, marginBottom: 20 }}>
        Sleep, HRV, and readiness data
      </Text>

      {/* Recovery Score */}
      {recoveryScore !== null ? (
        <View style={{
          backgroundColor: COLORS.card, borderRadius: 16, padding: 24,
          borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', marginBottom: 16,
        }}>
          <ScoreRing score={recoveryScore} label="Recovery Score" />
          <Text style={{ color: COLORS.dim, fontSize: 12, marginTop: 12 }}>
            Based on {sleepSource === 'eight_sleep' ? 'Eight Sleep' : 'Apple Health'} data
          </Text>
        </View>
      ) : (
        <View style={{
          backgroundColor: COLORS.card, borderRadius: 16, padding: 24,
          borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', marginBottom: 16,
        }}>
          <Ionicons name="heart-circle-outline" size={48} color={COLORS.dim} />
          <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '600', marginTop: 12 }}>
            Connect Health Data
          </Text>
          <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 8 }}>
            Link Apple Health or Eight Sleep to get recovery scores and smarter exercise plans
          </Text>
          <Pressable
            onPress={handleEnableHealthKit}
            style={{
              backgroundColor: COLORS.teal, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10,
              marginTop: 16,
            }}
          >
            <Text style={{ color: COLORS.white, fontWeight: '600' }}>Enable Apple Health</Text>
          </Pressable>
        </View>
      )}

      {/* Data Sources */}
      <View style={{
        backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
        borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
      }}>
        <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>
          Data Sources
        </Text>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="heart" size={20} color={COLORS.red} />
            <Text style={{ color: COLORS.white, marginLeft: 8 }}>Apple Health</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: healthKit.available ? COLORS.green : COLORS.dim,
              marginRight: 8,
            }} />
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>
              {healthKit.available ? 'Connected' : 'Requires dev build'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="bed" size={20} color={COLORS.purple} />
            <Text style={{ color: COLORS.white, marginLeft: 8 }}>Eight Sleep</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: eightSleep.available ? COLORS.green : COLORS.dim,
              marginRight: 8,
            }} />
            <Text style={{ color: COLORS.muted, fontSize: 12 }}>
              {eightSleep.available ? 'Connected' : 'Not configured'}
            </Text>
          </View>
        </View>
      </View>

      {/* Sleep Section */}
      <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
        💤 Sleep
      </Text>

      {sleepSource === 'eight_sleep' && eightSleep.lastNight ? (
        <>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <StatCard icon="moon" label="Sleep Score" value={eightSleep.lastNight.score} unit="/100" color={COLORS.purple} />
            <StatCard icon="time" label="Duration" value={eightSleep.lastNight.duration_hours.toFixed(1)} unit="hrs" color={COLORS.blue} />
          </View>
          <View style={{
            backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
          }}>
            <SleepBar label="Deep Sleep" hours={eightSleep.lastNight.duration_hours * eightSleep.lastNight.deep_sleep_pct / 100} color={COLORS.purple} />
            <SleepBar label="REM Sleep" hours={eightSleep.lastNight.duration_hours * eightSleep.lastNight.rem_sleep_pct / 100} color={COLORS.blue} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ color: COLORS.dim, fontSize: 12 }}>Time to sleep: {eightSleep.lastNight.time_to_sleep_min.toFixed(0)} min</Text>
              <Text style={{ color: COLORS.dim, fontSize: 12 }}>Toss & turns: {eightSleep.lastNight.toss_turns}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: COLORS.dim, fontSize: 12 }}>Bed temp: {eightSleep.lastNight.bed_temp_f}°F</Text>
              <Text style={{ color: COLORS.dim, fontSize: 12 }}>Room temp: {eightSleep.lastNight.room_temp_f}°F</Text>
            </View>
          </View>
        </>
      ) : sleepSource === 'apple_health' && healthKit.sleep?.lastNight ? (
        <>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <StatCard icon="moon" label="Quality" value={healthKit.sleep.lastNight.quality} color={COLORS.purple} />
            <StatCard icon="time" label="Duration" value={healthKit.sleep.lastNight.duration_hours.toFixed(1)} unit="hrs" color={COLORS.blue} />
          </View>
          <View style={{
            backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
            borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
          }}>
            <SleepBar label="Deep Sleep" hours={healthKit.sleep.lastNight.deepSleep_hours} color={COLORS.purple} />
            <SleepBar label="REM Sleep" hours={healthKit.sleep.lastNight.remSleep_hours} color={COLORS.blue} />
            <SleepBar label="In Bed" hours={healthKit.sleep.lastNight.inBed_hours} color={COLORS.dim} />
          </View>
        </>
      ) : (
        <View style={{
          backgroundColor: COLORS.card, borderRadius: 12, padding: 24,
          borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', marginBottom: 16,
        }}>
          <Text style={{ color: COLORS.dim }}>No sleep data available</Text>
          <Text style={{ color: COLORS.dim, fontSize: 12, marginTop: 4 }}>
            Connect Apple Health or Eight Sleep
          </Text>
        </View>
      )}

      {/* Vitals */}
      <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
        ❤️ Vitals
      </Text>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        <StatCard 
          icon="pulse" 
          label="HRV" 
          value={healthKit.hrv?.latest ?? eightSleep.lastNight?.hrv_avg ?? '—'} 
          unit="ms" 
          color={COLORS.green}
          subtitle={healthKit.hrv?.trend ? `Trend: ${healthKit.hrv.trend}` : undefined}
        />
        <StatCard 
          icon="heart" 
          label="Resting HR" 
          value={healthKit.restingHeartRate?.latest ?? eightSleep.lastNight?.hr_avg ?? '—'} 
          unit="bpm" 
          color={COLORS.red}
          subtitle={healthKit.restingHeartRate?.weekAvg ? `7d avg: ${healthKit.restingHeartRate.weekAvg}` : undefined}
        />
      </View>

      {eightSleep.lastNight?.respiratory_rate ? (
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <StatCard icon="leaf" label="Respiratory Rate" value={eightSleep.lastNight.respiratory_rate.toFixed(1)} unit="br/min" color={COLORS.teal} />
          <StatCard icon="footsteps" label="Steps Today" value={healthKit.steps?.today ?? '—'} color={COLORS.amber} subtitle={healthKit.steps?.weekAvg ? `7d avg: ${healthKit.steps.weekAvg}` : undefined} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <StatCard icon="footsteps" label="Steps Today" value={healthKit.steps?.today ?? '—'} color={COLORS.amber} subtitle={healthKit.steps?.weekAvg ? `7d avg: ${healthKit.steps.weekAvg}` : undefined} />
        </View>
      )}

      {/* Impact on Plan */}
      <View style={{
        backgroundColor: COLORS.card, borderRadius: 12, padding: 16,
        borderWidth: 1, borderColor: COLORS.border, marginBottom: 16,
      }}>
        <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
          📋 Impact on Today's Plan
        </Text>
        {recoveryScore !== null ? (
          <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 20 }}>
            {recoveryScore >= 7
              ? '✅ Recovery looks good — full intensity recommended. Great time for compound exercises if it\'s a gym day.'
              : recoveryScore >= 4
                ? '⚠️ Moderate recovery — stick to corrective protocols. Avoid heavy lifts. Focus on mobility and stretching.'
                : '🔴 Low recovery — light corrective only. Prioritize breathing exercises, gentle stretching, and rest.'}
          </Text>
        ) : (
          <Text style={{ color: COLORS.dim, fontSize: 13 }}>
            Connect a data source to get personalized plan adjustments
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
