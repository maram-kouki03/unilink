import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Button, ChipRow, ErrorNote, Field, Header, Row, Screen, SegmentedTabs, Txt } from '@/components/ui';
import { useCreateItem } from '@/api/marketplace';
import { ItemMode } from '@/types/db';

const CATEGORIES = ['Furniture', 'Electronics', 'Exams', 'Books', 'Lab', 'Other'];

export default function NewItem() {
  const params = useLocalSearchParams<{ mode?: ItemMode }>();
  const create = useCreateItem();
  const [mode, setMode] = useState<ItemMode>(params.mode ?? 'rent');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Furniture');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState<'day' | 'week' | 'month'>('day');
  const [duration, setDuration] = useState('');
  const [condition, setCondition] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  const submit = () => {
    if (title.trim().length < 2) return Alert.alert('Add a name for the item');
    const p = mode === 'rent' ? Number(price.replace(',', '.')) : null;
    if (mode === 'rent' && (!p || p <= 0)) return Alert.alert('Set a price');
    create.mutate(
      { mode, title: title.trim(), category, price_tnd: p, price_unit: unit, max_duration: duration, condition, location, description, photoUri: photo },
      { onSuccess: (r) => router.replace(`/rents/${r.id}`) },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Publish offer" variant="gradient" arrow loading={create.isPending} onPress={submit} />}>
        <Header title="Post an offer" />
        <SegmentedTabs
          options={[
            { value: 'rent', label: 'Rent' },
            { value: 'borrow', label: 'Lend for free' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <PhotoPicker uri={photo} onChange={setPhoto} />
        <Field label="Item" placeholder="Study desk, Casio fx-991…" value={title} onChangeText={setTitle} />
        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700}>
            Category
          </Txt>
          <ChipRow wrap options={CATEGORIES.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />
        </View>
        {mode === 'rent' ? (
          <>
            <Row style={{ alignItems: 'flex-end' }}>
              <Field label="Price" keyboardType="decimal-pad" placeholder="5" value={price} onChangeText={setPrice} suffix="TND" style={{ flex: 1 }} />
              <View style={{ flex: 1 }}>
                <ChipRow
                  options={[
                    { value: 'day', label: '/ day' },
                    { value: 'week', label: '/ week' },
                    { value: 'month', label: '/ month' },
                  ]}
                  value={unit}
                  onChange={(v) => setUnit(v as 'day' | 'week' | 'month')}
                  wrap
                />
              </View>
            </Row>
            <Field label="Minimum duration" placeholder="3 days" value={duration} onChangeText={setDuration} />
          </>
        ) : (
          <Field label="Maximum duration" placeholder="1 week" value={duration} onChangeText={setDuration} />
        )}
        <Row>
          <Field label="Condition" placeholder="Very good" value={condition} onChangeText={setCondition} style={{ flex: 1 }} />
          <Field label="Pickup" placeholder="Ariana / Campus" value={location} onChangeText={setLocation} style={{ flex: 1 }} />
        </Row>
        <Field label="Description" placeholder="Details, what's included…" value={description} onChangeText={setDescription} multiline />
        <ErrorNote error={create.error} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
