import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const TEAL = '#14b8a6';
const SLATE_400 = '#94a3b8';
const SLATE_900 = '#0f172a';
const SLATE_950 = '#020617';

type TabIcon = React.ComponentProps<typeof Ionicons>['name'];

const tabs: { name: string; title: string; icon: TabIcon; iconFocused: TabIcon }[] = [
  { name: 'photos', title: 'Photos', icon: 'camera-outline', iconFocused: 'camera' },
  { name: 'videos', title: 'Videos', icon: 'videocam-outline', iconFocused: 'videocam' },
  { name: 'metrics', title: 'Metrics', icon: 'pulse-outline', iconFocused: 'pulse' },
  { name: 'posture', title: 'Posture', icon: 'body-outline', iconFocused: 'body' },
  { name: 'posture-camera', title: 'Camera', icon: 'aperture-outline', iconFocused: 'aperture' },
  { name: 'analysis', title: 'Analysis', icon: 'document-text-outline', iconFocused: 'document-text' },
  { name: 'todos', title: 'Protocol', icon: 'checkbox-outline', iconFocused: 'checkbox' },
  { name: 'exercises', title: 'Exercises', icon: 'barbell-outline', iconFocused: 'barbell' },
  { name: 'charts', title: 'Progress', icon: 'trending-up-outline', iconFocused: 'trending-up' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TEAL,
        tabBarInactiveTintColor: SLATE_400,
        tabBarStyle: {
          backgroundColor: SLATE_950,
          borderTopColor: 'rgba(51,65,85,0.5)',
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: SLATE_950,
        },
        headerTitleStyle: {
          color: '#f8fafc',
          fontWeight: '600',
        },
        headerTintColor: '#f8fafc',
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            headerTitle: tab.name === 'photos' ? 'Mobility Journey' : tab.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={size ?? 24}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
