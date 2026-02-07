import { Link, Stack } from 'expo-router';
import { View, Text } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 bg-slate-950 items-center justify-center p-5">
        <Text className="text-xl font-semibold text-white">Page not found</Text>
        <Link href="/analysis" className="mt-4">
          <Text className="text-teal-400 text-base">Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}
