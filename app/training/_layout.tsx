/**
 * Training stack navigator.
 * Hosts the session execution screen (and future training sub-screens).
 */
import { Stack } from 'expo-router';
import { colors, typography } from '../../lib/theme';

export default function TrainingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.bgDeep,
        },
        headerTitleStyle: {
          ...typography.h3,
          color: colors.textPrimary,
        },
        headerTintColor: colors.teal,
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: colors.bgBase },
      }}
    >
      <Stack.Screen name="session" options={{ title: 'Session', headerShown: false }} />
      <Stack.Screen name="completion" options={{ title: 'Program Complete', headerShown: false }} />
    </Stack>
  );
}
