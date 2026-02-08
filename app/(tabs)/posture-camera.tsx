import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import CameraPostureMonitor from '../../components/CameraPostureMonitor';
import { colors, typography, spacing, shared } from '@/lib/theme';

export default function PostureCameraScreen() {
  return (
    <ScrollView
      style={shared.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['4xl'] }}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={shared.pageTitle}>Camera Posture</Text>
        <Text style={shared.pageSubtitle}>
          Use your front camera for posture checks and slouch detection.
        </Text>
      </View>

      <CameraPostureMonitor />
    </ScrollView>
  );
}
