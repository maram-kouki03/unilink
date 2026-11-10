import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconName } from '@/components/Icon';
import { IconTile, Row, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { colors } from '@/theme';

const ACTIONS: { label: string; sub: string; icon: IconName; href: string }[] = [
  { label: 'Post a discussion', sub: 'Ask your promo or the whole campus', icon: 'chat', href: '/discussions/new' },
  { label: 'Upload a document', sub: 'Exams, courses, summaries, TD/TP', icon: 'upload', href: '/documents/upload' },
  { label: 'Offer a ride', sub: 'Share your seats to SUP’COM', icon: 'car', href: '/rides/offer' },
  { label: 'Post an item', sub: 'Rent or lend something', icon: 'box', href: '/rents/new' },
  { label: 'Report lost / found', sub: 'Help items find their owner', icon: 'search', href: '/lost-found/report' },
];

export default function QuickCreate() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={() => router.back()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />
        <Txt size={20} weight={800} style={{ marginBottom: 8 }}>
          Create
        </Txt>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.href}
            accessibilityRole="button"
            onPress={() => {
              router.back();
              setTimeout(() => router.push(a.href as never), 50);
            }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bg }]}
          >
            <Row>
              <IconTile icon={a.icon} size={46} />
              <View style={{ flex: 1 }}>
                <Txt size={15} weight={700}>
                  {a.label}
                </Txt>
                <Txt size={12} color={colors.muted}>
                  {a.sub}
                </Txt>
              </View>
              <Icon name="chevronRight" size={18} color={colors.iconMuted} />
            </Row>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(18,21,61,0.4)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, gap: 4 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDF0', marginBottom: 12 },
  row: { borderRadius: 16, padding: 8 },
});
