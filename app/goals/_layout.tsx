import { Stack } from 'expo-router';
import { colors, typography } from '../../lib/theme';

export default function GoalsLayout() {
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
        headerShadowVisible: false,
      }}
    />
  );
}
