import React from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { EVENT_GRADIENTS, EventGlyph } from '@/components/Illustrations';
import { Badge, Button, ErrorNote, IconButton, IconTile, Loading, Row, Txt } from '@/components/ui';
import { useEvent, useToggleRegistration } from '@/api/social';
import { hhmm, longDate } from '@/lib/format';
import { colors } from '@/theme';
import { initials } from '@/lib/format';

const gcal = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ev = useEvent(id);
  const toggle = useToggleRegistration();
  const insets = useSafeAreaInsets();

  if (ev.isLoading) return <SafeAreaView style={{ flex: 1 }}><Loading /></SafeAreaView>;
  if (!ev.data) return <SafeAreaView style={{ flex: 1, padding: 20 }}><ErrorNote error={ev.error ?? 'Event not found'} /></SafeAreaView>;
  const e = ev.data;
  const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 2 * 3600 * 1000).toISOString();

  const addToCalendar = () =>
    Linking.openURL(
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${gcal(e.starts_at)}/${gcal(end)}&location=${encodeURIComponent(`${e.location}, SUP'COM`)}&details=${encodeURIComponent(e.description ?? '')}`,
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.card }}>
      <StatusBar style="light" />
      <LinearGradient colors={EVENT_GRADIENTS[e.category] ?? EVENT_GRADIENTS.conference} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cover, { paddingTop: insets.top + 8 }]}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevronLeft" label="Back" bg="rgba(255,255,255,0.18)" color={colors.white} onPress={() => router.back()} />
          <IconButton icon="share" label="Share event" bg="rgba(255,255,255,0.18)" color={colors.white} onPress={() => Share.share({ message: `${e.title} · ${longDate(e.starts_at)} · ${e.location}` })} />
        </Row>
        <View style={{ position: 'absolute', right: 24, top: insets.top + 70 }}>
          <EventGlyph category={e.category} size={120} />
        </View>
        <View style={{ gap: 8, maxWidth: 230, marginTop: 'auto', marginBottom: 40 }}>
          <Badge label={e.category.toUpperCase()} tone="white" />
          <Txt size={26} weight={800} color={colors.white}>
            {e.title}
          </Txt>
        </View>
      </LinearGradient>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Row>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Txt size={14} weight={800} color={colors.white}>
              {initials(e.organizer)}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt size={15} weight={700}>
              {e.organizer}
            </Txt>
            <Txt size={12} color={colors.muted}>
              Organizer
            </Txt>
          </View>
        </Row>
        <Row>
          <IconTile icon="calendar" size={44} />
          <View>
            <Txt size={14} weight={700}>
              {longDate(e.starts_at)}
            </Txt>
            <Txt size={12} color={colors.muted}>
              {hhmm(e.starts_at)}
              {e.ends_at ? ` – ${hhmm(e.ends_at)}` : ''}
            </Txt>
          </View>
        </Row>
        <Row>
          <IconTile icon="pin" size={44} />
          <View style={{ flex: 1 }}>
            <Txt size={14} weight={700}>
              {e.location}
            </Txt>
            <Txt size={12} color={colors.muted}>
              SUP'COM · El Ghazala
            </Txt>
          </View>
          <Button title="Map" variant="ghost" small onPress={() => router.push('/map')} />
        </Row>
        {e.description ? (
          <View style={{ gap: 6 }}>
            <Txt size={15} weight={800}>
              About
            </Txt>
            <Txt size={14} color={colors.muted} style={{ lineHeight: 22 }}>
              {e.description}
            </Txt>
          </View>
        ) : null}
        <Txt size={13} color={colors.muted}>
          <Txt size={13} weight={800}>
            {e.going} students
          </Txt>{' '}
          are going
        </Txt>
        <Row style={{ marginTop: 'auto' }}>
          <Button title="Add to calendar" variant="outline" icon="calendar" style={{ flex: 1 }} onPress={addToCalendar} />
          <Button
            title={e.registered_by_me ? 'Registered ✓' : 'Register'}
            variant={e.registered_by_me ? 'ghost' : 'gradient'}
            arrow={!e.registered_by_me}
            loading={toggle.isPending}
            style={{ flex: 1.1 }}
            onPress={() => toggle.mutate({ id: e.id, registered: e.registered_by_me })}
          />
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { height: 320, paddingHorizontal: 20 },
  sheet: { flex: 1, marginTop: -28, backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 16 },
});
