import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const TEAL = '#14b8a6';
const SLATE_400 = '#94a3b8';
const SLATE_900 = '#0f172a';
const SLATE_950 = '#020617';

type TabIcon = React.ComponentProps<typeof Ionicons>['name'];

// Main tabs shown in bottom bar
const tabs: { name: string; title: string; icon: TabIcon; iconFocused: TabIcon }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'plan', title: 'Plan', icon: 'sparkles-outline', iconFocused: 'sparkles' },
  { name: 'workouts', title: 'Workouts', icon: 'fitness-outline', iconFocused: 'fitness' },
  { name: 'posture', title: 'Posture', icon: 'body-outline', iconFocused: 'body' },
  { name: 'charts', title: 'Progress', icon: 'trending-up-outline', iconFocused: 'trending-up' },
];

// Hidden tabs — accessible from within other screens but not in bottom bar
const hiddenTabs = [
  'photos', 'videos', 'metrics', 'posture-camera', 'analysis', 'todos', 'exercises', 'health', 'program',
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
            headerTitle: tab.name === 'index' ? 'Mobility Journey' : tab.title,
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
      {hiddenTabs.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            href: null,
          }}
        />
      ))}
    </Tabs>
  );
}
