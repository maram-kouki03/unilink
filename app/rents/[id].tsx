import React from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemArt } from '@/components/Illustrations';
import { Avatar, Badge, Button, ErrorNote, IconButton, InfoTile, Loading, Row, Txt } from '@/components/ui';
import { useItem, useSetItemAvailable } from '@/api/marketplace';
import { startConversation } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { publicImageUrl } from '@/lib/storage';
import { colors, shadows } from '@/theme';
import { LEVEL_LABEL } from '@/types/db';

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const setAvailable = useSetItemAvailable();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();

  if (item.isLoading) return <SafeAreaView style={{ flex: 1 }}><Loading /></SafeAreaView>;
  if (!item.data) return <SafeAreaView style={{ flex: 1, padding: 20 }}><ErrorNote error={item.error ?? 'Item not found'} /></SafeAreaView>;
  const it = item.data;
  const mine = it.owner_id === session?.user.id;
  const img = publicImageUrl(it.photo_path);

  const contact = async () => {
    try {
      const cid = await startConversation(it.owner_id, it.title);
      router.push(`/chat/${cid}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={['#E4E5FB', '#D9D4FB']} style={styles.hero}>
        {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <ItemArt category={it.category} size={180} />}
      </LinearGradient>
      <View style={{ position: 'absolute', top: insets.top + 8, left: 20 }}>
        <IconButton icon="chevronLeft" label="Back" onPress={() => router.back()} />
      </View>

      <View style={[styles.sheet, shadows.nav, { paddingBottom: insets.bottom + 16 }]}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 6, flex: 1 }}>
            <Txt size={24} weight={800}>
              {it.title}
            </Txt>
            <Row gap={6}>
              <Badge label={it.available ? 'Available' : 'Unavailable'} tone={it.available ? 'success' : 'neutral'} />
              <Badge label={it.category} tone="navy" />
            </Row>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt size={24} weight={800} color={colors.royal}>
              {it.price_tnd ? `${Number(it.price_tnd)} TND` : 'Free'}
            </Txt>
            <Txt size={12} color={colors.muted}>
              {it.price_tnd ? `per ${it.price_unit}` : 'to borrow'}
            </Txt>
          </View>
        </Row>
        {it.description ? (
          <Txt size={14} color={colors.muted} style={{ lineHeight: 22 }}>
            {it.description}
          </Txt>
        ) : null}
        <Row gap={10}>
          <InfoTile label="Condition" value={it.condition || '—'} />
          <InfoTile label="Pickup" value={it.location || 'Campus'} />
          <InfoTile label={it.mode === 'rent' ? 'Minimum' : 'Max time'} value={it.max_duration || '—'} />
        </Row>
        <Row style={{ borderWidth: 1.5, borderColor: colors.divider, borderRadius: 18, padding: 12 }}>
          <Avatar name={it.owner?.full_name} dark />
          <View style={{ flex: 1 }}>
            <Txt size={15} weight={700}>
              {it.owner?.full_name}
            </Txt>
            <Txt size={12} color={colors.muted}>
              {it.owner?.level ? LEVEL_LABEL[it.owner.level] : 'SUP’COM'}
            </Txt>
          </View>
        </Row>
        <View style={{ marginTop: 'auto' }}>
          {mine ? (
            <Button
              title={it.available ? 'Mark as unavailable' : 'Mark as available'}
              variant="outline"
              loading={setAvailable.isPending}
              onPress={() => setAvailable.mutate({ id: it.id, available: !it.available })}
            />
          ) : (
            <Row>
              <IconButton icon="chat" label="Send a message" bg={colors.tile} size={58} onPress={contact} />
              <Button title="Contact owner" arrow style={{ flex: 1 }} onPress={contact} />
            </Row>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 350, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheet: { flex: 1, marginTop: -30, backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 16 },
});
