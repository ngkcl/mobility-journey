import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@dismissed_insights';

/**
 * Max age for dismissed insight records (7 days).
 * After this, insights can resurface if still relevant.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type DismissalRecord = Record<string, number>; // id → timestamp

export async function loadDismissedInsights(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();

    const records: DismissalRecord = JSON.parse(raw);
    const now = Date.now();
    const active = new Set<string>();
    let pruned = false;

    for (const [id, ts] of Object.entries(records)) {
      if (now - ts < MAX_AGE_MS) {
        active.add(id);
      } else {
        pruned = true;
      }
    }

    // Prune expired entries lazily
    if (pruned) {
      const cleaned: DismissalRecord = {};
      for (const id of active) {
        cleaned[id] = records[id];
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    }

    return active;
  } catch {
    return new Set();
  }
}

export async function dismissInsight(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const records: DismissalRecord = raw ? JSON.parse(raw) : {};
    records[id] = Date.now();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Silent fail — worst case the insight shows again
  }
}

export async function clearDismissedInsights(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}
