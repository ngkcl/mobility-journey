import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../../lib/theme';

type TabIcon = React.ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; title: string; icon: TabIcon; iconFocused: TabIcon }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'photos', title: 'Photos', icon: 'camera-outline', iconFocused: 'camera' },
  { name: 'videos', title: 'Videos', icon: 'videocam-outline', iconFocused: 'videocam' },
  { name: 'metrics', title: 'Metrics', icon: 'pulse-outline', iconFocused: 'pulse' },
  { name: 'plan', title: 'Plan', icon: 'sparkles-outline', iconFocused: 'sparkles' },
  { name: 'posture', title: 'Posture', icon: 'body-outline', iconFocused: 'body' },
  { name: 'posture-camera', title: 'Camera', icon: 'aperture-outline', iconFocused: 'aperture' },
  { name: 'analysis', title: 'Analysis', icon: 'document-text-outline', iconFocused: 'document-text' },
  { name: 'todos', title: 'Protocol', icon: 'checkbox-outline', iconFocused: 'checkbox' },
  { name: 'exercises', title: 'Exercises', icon: 'barbell-outline', iconFocused: 'barbell' },
  { name: 'workouts', title: 'Workouts', icon: 'fitness-outline', iconFocused: 'fitness' },
  { name: 'charts', title: 'Progress', icon: 'trending-up-outline', iconFocused: 'trending-up' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          paddingBottom: 6,
          paddingTop: 4,
          height: 64,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          ...typography.tiny,
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: colors.bgDeep,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTitleStyle: {
          ...typography.h3,
          color: colors.textPrimary,
        },
        headerTintColor: colors.textPrimary,
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerTitle: tab.name === 'index' ? 'Mobility Journey' : tab.title,
            tabBarIcon: ({ focused, color, size }) => (
              <View
                style={
                  focused
                    ? {
                        backgroundColor: colors.tealDim,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                      }
                    : undefined
                }
              >
                <Ionicons
                  name={focused ? tab.iconFocused : tab.icon}
                  size={size ?? 22}
                  color={color}
                />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
