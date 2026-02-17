/**
 * Haptics utility — consistent tactile feedback across the app.
 *
 * Wraps expo-haptics with semantic methods so screens don't need to
 * know which feedback style to use. Silently no-ops on simulators
 * or platforms without haptics support.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isHapticsAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

/** Light tap — button presses, navigation, minor interactions */
export async function tapLight(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Silently ignore (e.g. simulator)
  }
}

/** Medium tap — completing an exercise, toggling important settings */
export async function tapMedium(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {}
}

/** Heavy tap — finishing a workout, reaching a milestone */
export async function tapHeavy(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {}
}

/** Success notification — goal completed, streak milestone */
export async function notifySuccess(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}

/** Warning notification — behind on goal, missed session */
export async function notifyWarning(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {}
}

/** Error notification — failed action, validation error */
export async function notifyError(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {}
}

/** Selection tick — scrolling through pickers, sliders */
export async function selectionTick(): Promise<void> {
  if (!isHapticsAvailable) return;
  try {
    await Haptics.selectionAsync();
  } catch {}
}
