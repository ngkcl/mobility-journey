import { View, Text } from 'react-native';

export default function TodosScreen() {
  return (
    <View className="flex-1 bg-[#0b1020] items-center justify-center px-6">
      <Text className="text-2xl font-semibold text-[#f8fafc]">Protocol</Text>
      <Text className="text-slate-400 text-center mt-2">
        Your daily protocol tasks will appear here.
      </Text>
    </View>
  );
}
