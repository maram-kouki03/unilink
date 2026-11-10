import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { RouteDots } from '@/components/cards';
import { Button, Card, ErrorNote, Field, Header, IconButton, Row, Screen, SegmentedTabs, Stepper, Txt } from '@/components/ui';
import { useOfferRide } from '@/api/rides';
import { toIso, todayInput } from '@/lib/format';
import { colors, fonts } from '@/theme';
import { RideScope } from '@/types/db';
import { TextInput } from 'react-native';

const SUPCOM = "SUP'COM · El Ghazala";

export default function OfferRide() {
  const params = useLocalSearchParams<{ scope?: RideScope }>();
  const offer = useOfferRide();
  const [scope, setScope] = useState<RideScope>(params.scope ?? 'within_city');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(SUPCOM);
  const [date, setDate] = useState(todayInput());
  const [time, setTime] = useState('07:40');
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState('3');
  const [recurring, setRecurring] = useState(false);
  const [car, setCar] = useState('');
  const [note, setNote] = useState('');

  const submit = () => {
    try {
      if (from.trim().length < 2 || to.trim().length < 2) throw new Error('Add departure and destination');
      const departure_at = toIso(date, time);
      if (new Date(departure_at).getTime() < Date.now()) throw new Error('Departure must be in the future');
      offer.mutate(
        { scope, from_place: from.trim(), to_place: to.trim(), departure_at, seats_total: seats, price_tnd: Number(price.replace(',', '.')) || 0, recurring, car, note },
        { onSuccess: (r) => router.replace(`/rides/${r.id}`) },
      );
    } catch (e) {
      Alert.alert('Check the form', e instanceof Error ? e.message : String(e));
    }
  };

  const inputStyle = { fontFamily: fonts[700], fontSize: 15, color: colors.text, padding: 0 } as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Publish ride" variant="gradient" arrow loading={offer.isPending} onPress={submit} />}>
        <Header title="Offer a ride" />
        <SegmentedTabs
          options={[
            { value: 'between_cities', label: 'Between Cities' },
            { value: 'within_city', label: 'Within City' },
          ]}
          value={scope}
          onChange={setScope}
        />
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
          <RouteDots height={34} />
          <View style={{ flex: 1 }}>
            <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 2 }}>
              <Txt size={11} weight={700} color={colors.muted}>
                From
              </Txt>
              <TextInput accessibilityLabel="From" placeholder={scope === 'within_city' ? 'Ariana Centre' : 'Sousse'} placeholderTextColor={colors.placeholder} value={from} onChangeText={setFrom} style={inputStyle} />
            </View>
            <View style={{ paddingVertical: 8, gap: 2 }}>
              <Txt size={11} weight={700} color={colors.muted}>
                To
              </Txt>
              <TextInput accessibilityLabel="To" value={to} onChangeText={setTo} style={inputStyle} />
            </View>
          </View>
          <IconButton
            icon="swap"
            label="Swap departure and destination"
            bg={colors.tile}
            onPress={() => {
              setFrom(to);
              setTo(from);
            }}
          />
        </Card>
        <Row>
          <Field label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} style={{ flex: 1 }} />
          <Field label="Departure" placeholder="HH:MM" value={time} onChangeText={setTime} style={{ flex: 1 }} />
        </Row>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Txt size={13} weight={700}>
              Seats
            </Txt>
            <Stepper value={seats} onChange={setSeats} max={8} />
          </View>
          <Field label="Price per seat" keyboardType="decimal-pad" value={price} onChangeText={setPrice} suffix="TND" style={{ flex: 1 }} />
        </Row>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: recurring }} onPress={() => setRecurring(!recurring)}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt size={14} weight={700}>
                Repeat every weekday
              </Txt>
              <Txt size={12} color={colors.muted}>
                Mon – Fri, same time
              </Txt>
            </View>
            <Switch value={recurring} onValueChange={setRecurring} trackColor={{ true: colors.navy, false: '#D5D7EE' }} thumbColor={colors.white} />
          </Card>
        </Pressable>
        <Field label="Car (optional)" placeholder="Clio · Grey" value={car} onChangeText={setCar} />
        <Field label="Note for passengers" placeholder="Meeting point, luggage, music…" value={note} onChangeText={setNote} multiline />
        <ErrorNote error={offer.error} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
