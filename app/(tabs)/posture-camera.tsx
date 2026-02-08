import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import CameraPostureMonitor from '../../components/CameraPostureMonitor';
import { colors } from '@/lib/theme';

export default function PostureCameraScreen() {
  return (
    <ScrollView
      className="flex-1 bg-[#0b1020]"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <View className="mb-6">
        <Text className="text-2xl font-semibold text-white">Camera Posture</Text>
        <Text className="text-slate-400 text-sm">
          Use your front camera for posture checks and slouch detection.
        </Text>
      </View>

      <CameraPostureMonitor />
    </ScrollView>
  );
}
