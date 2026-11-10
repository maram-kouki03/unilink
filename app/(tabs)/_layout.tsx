import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '@/components/Icon';
import { Txt } from '@/components/ui';
import { colors, shadows } from '@/theme';

type TabHref = '/' | '/documents' | '/discussions' | '/profile';

const TABS: { href: TabHref; label: string; icon: IconName }[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/documents', label: 'Documents', icon: 'folder' },
  { href: '/discussions', label: 'Discussions', icon: 'chat' },
  { href: '/profile', label: 'Profile', icon: 'user' },
];

function BottomNav() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const item = (tabIndex: number) => {
    const t = TABS[tabIndex];
    const focused = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
    return (
      <Pressable
        key={t.href}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={t.label}
        onPress={() => {
          if (!focused) router.navigate(t.href);
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
    <View style={styles.root}>
      <Slot />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
