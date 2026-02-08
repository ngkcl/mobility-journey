import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';

type ProfileLink = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  route: string;
};

const PROFILE_LINKS: ProfileLink[] = [
  {
    title: 'Health & Recovery',
    subtitle: 'Sleep, HRV, and readiness data',
    icon: 'heart',
    iconColor: colors.error,
    route: '/health',
  },
  {
    title: 'Program',
    subtitle: 'Base program & coach assignments',
    icon: 'calendar',
    iconColor: colors.teal,
    route: '/program',
  },
];

const SETTINGS_ITEMS = [
  { title: 'Notifications', icon: 'notifications-outline' as const, subtitle: 'Manage reminders' },
  { title: 'Data & Privacy', icon: 'shield-outline' as const, subtitle: 'Export and manage your data' },
  { title: 'About', icon: 'information-circle-outline' as const, subtitle: 'Version and support' },
];

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <ScrollView style={shared.screen} contentContainerStyle={s.content}>
      {/* Profile header */}
      <View style={s.profileHeader}>
        <View style={s.avatarWrap}>
          <Ionicons name="person" size={32} color={colors.teal} />
        </View>
        <View style={s.profileInfo}>
          <Text style={s.profileName}>Mobility Journey</Text>
          <Text style={s.profileSubtitle}>Scoliosis correction program</Text>
        </View>
      </View>

      {/* Quick links */}
      <Text style={s.sectionLabel}>Health & Program</Text>
      {PROFILE_LINKS.map((link) => (
        <Pressable
          key={link.route}
          onPress={() => router.push(link.route as any)}
          style={({ pressed }) => [s.linkCard, pressed && s.linkCardPressed]}
        >
          <View style={[s.linkIconWrap, { backgroundColor: `${link.iconColor}20` }]}>
            <Ionicons name={link.icon} size={20} color={link.iconColor} />
          </View>
          <View style={s.linkTextWrap}>
            <Text style={s.linkTitle}>{link.title}</Text>
            <Text style={s.linkSubtitle}>{link.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ))}

      {/* Settings */}
      <Text style={[s.sectionLabel, { marginTop: spacing['2xl'] }]}>Settings</Text>
      {SETTINGS_ITEMS.map((item) => (
        <View key={item.title} style={s.settingsRow}>
          <View style={s.settingsIconWrap}>
            <Ionicons name={item.icon} size={20} color={colors.textTertiary} />
          </View>
          <View style={s.linkTextWrap}>
            <Text style={s.linkTitle}>{item.title}</Text>
            <Text style={s.linkSubtitle}>{item.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      ))}

      {/* App info */}
      <View style={s.appInfo}>
        <Text style={s.appInfoText}>Mobility Journey v1.0</Text>
        <Text style={s.appInfoText}>Built for scoliosis correction</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'] * 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing['2xl'],
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tealDim,
    borderWidth: 2,
    borderColor: colors.tealBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  profileSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  sectionLabel: {
    ...typography.captionMedium,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.md,
  },
  linkCard: {
    ...shared.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  linkCardPressed: {
    opacity: 0.7,
  },
  linkIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTextWrap: {
    flex: 1,
  },
  linkTitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  linkSubtitle: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: 2,
  },
  settingsRow: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  settingsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: spacing['3xl'],
    gap: spacing.xs,
  },
  appInfoText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
