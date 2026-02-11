import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '../../lib/theme';

type TabIcon = React.ComponentProps<typeof Ionicons>['name'];

/** Tabs that appear in the bottom bar */
const visibleTabs: { name: string; title: string; icon: TabIcon; iconFocused: TabIcon }[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'goals', title: 'Goals', icon: 'flag-outline', iconFocused: 'flag' },
  { name: 'workouts', title: 'Workouts', icon: 'fitness-outline', iconFocused: 'fitness' },
  { name: 'reports', title: 'Reports', icon: 'document-text-outline', iconFocused: 'document-text' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconFocused: 'person' },
];

/** Hidden tab screens — accessible via router.push() but not in the tab bar */
const hiddenTabs: string[] = [
  'photos',
  'videos',
  'metrics',
  'posture',
  'posture-camera',
  'analysis',
  'exercises',
  'todos',
  'health',
  'program',
  'charts',
  'plan',
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
      {/* Visible tabs */}
      {visibleTabs.map((tab) => (
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

      {/* Hidden tab screens — still routable but not in the tab bar */}
      {hiddenTabs.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            href: null,
            headerTitle:
              name === 'posture-camera'
                ? 'Camera Posture'
                : name.charAt(0).toUpperCase() + name.slice(1),
          }}
        />
      ))}
    </Tabs>
  );
}
