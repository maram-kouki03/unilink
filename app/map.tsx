import React, { useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CampusMapArt } from '@/components/CampusMapArt';
import { Button, ChipRow, IconButton, IconTile, Row, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { CAMPUS_CATEGORIES, CAMPUS_PLACES, CampusCategory } from '@/data/campus';
import { colors, fonts, shadows } from '@/theme';

export default function CampusMap() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(CAMPUS_PLACES.find((p) => p.category === 'library')!);
  const [q, setQ] = useState('');

  const matches = useMemo(
    () => (q.trim() ? CAMPUS_PLACES.filter((p) => `${p.name} ${p.subtitle}`.toLowerCase().includes(q.trim().toLowerCase())) : []),
    [q],
  );

  const directions = () => {
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${selected.lat},${selected.lng}&dirflg=w`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}&travelmode=walking`,
    });
    Linking.openURL(url!);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#E3E5F6' }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 120, paddingBottom: 260 }} showsVerticalScrollIndicator={false}>
        <CampusMapArt width={width} selectedId={selected.id} onSelect={setSelected} />
      </ScrollView>

      <View style={[styles.top, { top: insets.top + 8 }]}>
        <Row gap={10}>
          <IconButton icon="chevronLeft" label="Back" size={50} onPress={() => router.back()} />
          <View style={[styles.search, shadows.card]}>
            <Icon name="search" size={20} color={colors.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search a building…"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Search a building"
              style={{ flex: 1, fontFamily: fonts[500], fontSize: 14, color: colors.text }}
            />
          </View>
        </Row>
        {matches.length ? (
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 6 }, shadows.card]}>
            {matches.map((m) => (
              <Button
                key={m.id}
                title={m.name}
                variant="ghost"
                small
                style={{ justifyContent: 'flex-start', marginVertical: 2 }}
                onPress={() => {
                  setSelected(m);
                  setQ('');
                }}
              />
            ))}
          </View>
        ) : (
          <ChipRow
            variant="white"
            options={CAMPUS_CATEGORIES}
            value={selected.category}
            onChange={(c: CampusCategory) => setSelected(CAMPUS_PLACES.find((p) => p.category === c) ?? selected)}
          />
        )}
      </View>

      <View style={[styles.sheet, shadows.nav, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.handle} />
        <Row gap={14}>
          <IconTile icon={selected.category === 'library' ? 'book' : selected.category === 'labs' ? 'bolt' : 'pin'} size={52} bg={colors.violetBg} color={colors.violet} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt size={18} weight={800}>
              {selected.name}
            </Txt>
            <Row gap={6}>
              <Icon name="walk" size={14} color={colors.royal} />
              <Txt size={13} color={colors.muted}>
                {selected.walkMin} min walk · {selected.hours}
              </Txt>
            </Row>
            <Txt size={12} color={colors.muted}>
              {selected.subtitle}
            </Txt>
          </View>
        </Row>
        <Button title="Directions" icon="navigate" onPress={directions} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 20, right: 20, gap: 12 },
  search: { flex: 1, height: 50, borderRadius: 16, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, gap: 16 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDF0' },
});
