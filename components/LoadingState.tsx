import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

interface LoadingStateProps {
  label: string;
  rows?: number;
}

export default function LoadingState({ label }: LoadingStateProps) {
  return (
    <View className="rounded-2xl border border-slate-700 bg-slate-900 p-8 items-center gap-3">
      <ActivityIndicator size="small" color="#5eead4" />
      <Text className="text-slate-300 text-sm">{label}</Text>
    </View>
  );
}
