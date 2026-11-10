import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteDots } from '@/components/cards';
import { Avatar, Button, ErrorNote, IconButton, InfoTile, Loading, Row, Stepper, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useBookRide, useCancelBooking, useCancelRide, useRide } from '@/api/rides';
import { startConversation } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { SUPCOM_COORDS } from '@/data/campus';
import { dayLabel, hhmm } from '@/lib/format';
import { colors, shadows } from '@/theme';
import { LEVEL_LABEL } from '@/types/db';

export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ride = useRide(id);
  const book = useBookRide();
  const cancelBooking = useCancelBooking();
  const cancelRide = useCancelRide();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [seats, setSeats] = useState(1);

  if (ride.isLoading) return <SafeAreaView style={{ flex: 1 }}><Loading /></SafeAreaView>;
  if (!ride.data) return <SafeAreaView style={{ flex: 1, padding: 20 }}><ErrorNote error={ride.error ?? 'Ride not found'} /></SafeAreaView>;
  const r = ride.data;
  const mine = r.driver_id === session?.user.id;

  const to = { latitude: r.to_lat ?? SUPCOM_COORDS.lat, longitude: r.to_lng ?? SUPCOM_COORDS.lng };
  const from = r.from_lat && r.from_lng ? { latitude: r.from_lat, longitude: r.from_lng } : null;
  const region = from
    ? {
        latitude: (from.latitude + to.latitude) / 2,
        longitude: (from.longitude + to.longitude) / 2,
        latitudeDelta: Math.abs(from.latitude - to.latitude) * 1.8 + 0.02,
        longitudeDelta: Math.abs(from.longitude - to.longitude) * 1.8 + 0.02,
      }
    : { ...to, latitudeDelta: 0.06, longitudeDelta: 0.06 };

  const message = async () => {
    try {
      const cid = await startConversation(r.driver_id, `Ride ${r.from_place} → ${r.to_place}`);
      router.push(`/chat/${cid}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapView style={{ height: 380 }} initialRegion={region}>
        <Marker coordinate={to} title="SUP'COM" pinColor={colors.violet} />
        {from ? <Marker coordinate={from} title={r.from_place} pinColor={colors.royal} /> : null}
        {from ? <Polyline coordinates={[from, to]} strokeColor={colors.royal} strokeWidth={5} /> : null}
      </MapView>
      <View style={{ position: 'absolute', top: insets.top + 8, left: 20 }}>
        <IconButton icon="chevronLeft" label="Back" onPress={() => router.back()} />
      </View>

      <View style={[styles.sheet, shadows.nav, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Row>
          <Avatar name={r.driver_name} size={50} />
          <View style={{ flex: 1 }}>
            <Txt size={17} weight={800}>
              {r.driver_name}
            </Txt>
            <Row gap={4}>
              <Icon name="star" size={13} color={colors.star} />
              <Txt size={12} color={colors.muted}>
                {r.driver_rating ? r.driver_rating.toFixed(1) : 'New'} · {r.driver_rides} rides{r.driver_level ? ` · ${LEVEL_LABEL[r.driver_level]}` : ''}
              </Txt>
            </Row>
          </View>
          {!mine ? <IconButton icon="chat" label="Message driver" bg={colors.tile} onPress={message} /> : null}
        </Row>

        <Row style={{ alignItems: 'stretch' }}>
          <RouteDots height={26} />
          <View style={{ flex: 1, gap: 14 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt size={15} weight={700} numberOfLines={1} style={{ flex: 1 }}>
                {r.from_place}
              </Txt>
              <Txt size={15} weight={800}>
                {hhmm(r.departure_at)}
              </Txt>
            </Row>
            <Txt size={15} weight={700} numberOfLines={1}>
              {r.to_place}
            </Txt>
          </View>
        </Row>

        <Row gap={10}>
          <InfoTile label="Date" value={dayLabel(r.departure_at)} />
          <InfoTile label="Car" value={r.car || '—'} />
          <InfoTile label="Free seats" value={`${r.seats_left} of ${r.seats_total}`} />
        </Row>
        {r.note ? (
          <Txt size={13} color={colors.muted} style={{ lineHeight: 19 }}>
            {r.note}
          </Txt>
        ) : null}
        <ErrorNote error={book.error ?? cancelBooking.error} />

        {mine ? (
          <Button
            title="Cancel this ride"
            variant="outline"
            onPress={() =>
              Alert.alert('Cancel ride?', 'Passengers will no longer see it.', [
                { text: 'Keep', style: 'cancel' },
                { text: 'Cancel ride', style: 'destructive', onPress: () => cancelRide.mutate(r.id, { onSuccess: () => router.back() }) },
              ])
            }
          />
        ) : r.booked_by_me ? (
          <Button title="Cancel my booking" variant="outline" loading={cancelBooking.isPending} onPress={() => cancelBooking.mutate(r.id)} />
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt size={14} weight={700}>
                Seats to book
              </Txt>
              <Stepper value={seats} onChange={setSeats} max={Math.max(1, r.seats_left)} />
            </Row>
            <Row>
              <View>
                <Txt size={12} weight={600} color={colors.muted}>
                  Total
                </Txt>
                <Txt size={22} weight={800} color={colors.navy}>
                  {Number(r.price_tnd) * seats} TND
                </Txt>
              </View>
              <Button
                title={r.seats_left > 0 ? 'Book seat' : 'Full'}
                arrow={r.seats_left > 0}
                disabled={r.seats_left < 1}
                loading={book.isPending}
                style={{ flex: 1 }}
                onPress={() => book.mutate({ rideId: r.id, seats }, { onSuccess: () => Alert.alert('Seat booked ✅', 'The driver has been notified.') })}
              />
            </Row>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, marginTop: -28, backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, gap: 16 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DCDDF0' },
});
