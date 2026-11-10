import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Button, ChipRow, ErrorNote, Field, Header, Screen, SegmentedTabs, Txt } from '@/components/ui';
import { useReportLostFound } from '@/api/marketplace';
import { CAMPUS_PLACES } from '@/data/campus';
import { LostKind } from '@/types/db';

const CATEGORIES = ['Electronics', 'Cards & IDs', 'Keys', 'Clothing', 'Books', 'Other'];
const PLACES = [...CAMPUS_PLACES.map((p) => p.name.split(' – ')[0]), 'Parking', 'Other'];

export default function ReportItem() {
  const params = useLocalSearchParams<{ kind?: LostKind }>();
  const report = useReportLostFound();
  const [kind, setKind] = useState<LostKind>(params.kind ?? 'lost');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Electronics');
  const [location, setLocation] = useState(PLACES[0]);
  const [when, setWhen] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  const submit = () => {
    if (title.trim().length < 2) return Alert.alert('Describe the item in a few words');
    report.mutate(
      { kind, title: title.trim(), category, location, description: [when && `When: ${when}`, description].filter(Boolean).join('\n'), photoUri: photo },
      {
        onSuccess: () => {
          Alert.alert('Report published', 'We will notify you when someone replies.');
          router.back();
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Submit report" arrow loading={report.isPending} onPress={submit} />}>
        <Header title="Report an item" />
        <SegmentedTabs
          options={[
            { value: 'lost', label: 'I lost something' },
            { value: 'found', label: 'I found something' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <PhotoPicker uri={photo} onChange={setPhoto} />
        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700}>
            Category
          </Txt>
          <ChipRow wrap options={CATEGORIES.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} />
        </View>
        <Field label="Item name" placeholder="White earbuds case" value={title} onChangeText={setTitle} />
        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700}>
            Location on campus
          </Txt>
          <ChipRow wrap options={PLACES.map((p) => ({ value: p, label: p }))} value={location} onChange={setLocation} variant="white" />
        </View>
        <Field label="When" placeholder="Yesterday, 14h" value={when} onChangeText={setWhen} />
        <Field label="Description" placeholder="Colour, brand, anything that helps…" value={description} onChangeText={setDescription} multiline />
        <ErrorNote error={report.error} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
