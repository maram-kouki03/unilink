import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Button, ChipRow, ErrorNote, Field, Header, Screen, Txt } from '@/components/ui';
import { useUpdateProfile } from '@/api/social';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';
import { LEVEL_CODES, LEVEL_LABEL, LevelCode } from '@/types/db';

const PERIODS: Record<LevelCode, string[]> = {
  '1A': ['P1', 'P2', 'P3', 'P4'],
  '2A': ['P1', 'P2', 'P3', 'P4'],
  '3A': ['P1', 'P2'],
  MASTERE: ['M1', 'M2'],
  DOCTORAT: ['Y1', 'Y2', 'Y3'],
};

export default function EditProfile() {
  const { profile, refreshProfile } = useAuth();
  const update = useUpdateProfile();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [level, setLevel] = useState<LevelCode>(profile?.level ?? '1A');
  const [period, setPeriod] = useState(profile?.period ?? PERIODS[profile?.level ?? '1A'][0]);

  const save = () =>
    update.mutate(
      { full_name: fullName.trim(), username: username.trim().toLowerCase() || undefined, level, period },
      {
        onSuccess: async () => {
          await refreshProfile();
          Alert.alert('Saved');
          router.back();
        },
      },
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Save changes" loading={update.isPending} onPress={save} />}>
        <Header title="My Profile" />
        <Field label="Full name" icon="user" value={fullName} onChangeText={setFullName} />
        <Field label="Username" placeholder="maram.kouki" autoCapitalize="none" value={username} onChangeText={setUsername} />
        <Field label="E-mail" icon="mail" value={profile?.email} editable={false} />
        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700}>
            Level
          </Txt>
          <ChipRow
            wrap
            options={LEVEL_CODES.map((c) => ({ value: c, label: LEVEL_LABEL[c] }))}
            value={level}
            onChange={(l) => {
              setLevel(l);
              setPeriod(PERIODS[l][0]);
            }}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700}>
            Current period
          </Txt>
          <ChipRow wrap options={PERIODS[level].map((p) => ({ value: p, label: p }))} value={period} onChange={setPeriod} activeColor={colors.violet} />
        </View>
        <ErrorNote error={update.error} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
