import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '@/components/Icon';
import { Txt } from '@/components/ui';
import { colors, shadows } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  documents: { label: 'Documents', icon: 'folder' },
  discussions: { label: 'Discussions', icon: 'chat' },
  profile: { label: 'Profile', icon: 'user' },
};

function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => TABS[r.name]);
  const item = (routeIndex: number) => {
    const route = routes[routeIndex];
    const focused = state.routes[state.index]?.key === route.key;
    const t = TABS[route.name];
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={t.label}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={styles.item}
      >
        <View style={[styles.iconWrap, focused && { backgroundColor: colors.tile }]}>
          <Icon name={t.icon} size={22} color={focused ? colors.navy : colors.iconMuted} />
        </View>
        <Txt size={11} weight={focused ? 800 : 600} color={focused ? colors.navy : colors.muted}>
          {t.label}
        </Txt>
      </Pressable>
    );
  };
  return (
    <View style={[styles.bar, shadows.nav, { height: 70 + insets.bottom, paddingBottom: insets.bottom }]}>
      {item(0)}
      {item(1)}
      <View style={styles.item}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quick create" onPress={() => router.push('/create')} style={[styles.fab, shadows.strong]}>
          <Icon name="plus" size={24} color={colors.white} />
        </Pressable>
      </View>
      {item(2)}
      {item(3)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <BottomNav {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="documents" />
      <Tabs.Screen name="discussions" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 6,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  iconWrap: { width: 52, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  fab: {
    marginTop: -32,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.navy,
    borderWidth: 5,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
