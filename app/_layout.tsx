import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ToastProvider } from '../components/Toast';
import { CelebrationProvider } from '../lib/CelebrationContext';
import { View } from 'react-native';

export default function RootLayout() {
  return (
    <ToastProvider>
      <CelebrationProvider>
      <View style={{ flex: 1, backgroundColor: '#0b1020' }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0b1020' },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="video/[id]"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Video Player',
            headerStyle: { backgroundColor: '#0f172a' },
            headerTintColor: '#fff',
          }}
        />
        <Stack.Screen
          name="workout-schedule"
          options={{
            headerShown: true,
            headerTitle: 'Workout Schedule',
            headerStyle: { backgroundColor: '#0f172a' },
            headerTintColor: '#fff',
          }}
        />
      </Stack>
        <StatusBar style="light" />
      </View>
      </CelebrationProvider>
    </ToastProvider>
  );
}
