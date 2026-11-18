import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { MatchNote, PasswordField, PasswordStrength } from '@/components/auth';
import { Button, ChipRow, ErrorNote, Field, Header, Row, Screen, Txt } from '@/components/ui';
import { passwordOk } from '@/lib/password';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';
import { LEVEL_CODES, LEVEL_LABEL, LevelCode } from '@/types/db';

export default function SignUp() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [level, setLevel] = useState<LevelCode>('1A');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const canSubmit = passwordOk(password) && password === confirm;

  const submit = async () => {
    setError(null);
    if (fullName.trim().length < 3) return setError(new Error('Please enter your full name.'));
    setBusy(true);
    try {
      const res = await signUp({ fullName, email, password, level });
      router.push({ pathname: '/verify-email', params: { email: res.email, sent: res.codeSent ? '1' : '0' } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Create Account" variant="gradient" arrow loading={busy} disabled={!canSubmit} onPress={submit} />}>
        <Header title="" />
        <View style={{ gap: 8 }}>
          <Txt size={30} weight={800} accessibilityRole="header">
            Create your account
          </Txt>
          <Txt size={15} color={colors.muted}>
            Join the SUP'COM student community.
          </Txt>
        </View>
        <Field label="Full name" icon="user" placeholder="Prénom Nom" value={fullName} onChangeText={setFullName} autoComplete="name" />
        <Field
          label="University email"
          icon="mail"
          placeholder="name@supcom.tn"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <PasswordField label="Password" placeholder="Create a strong password" value={password} onChangeText={setPassword} />
        <PasswordStrength password={password} />
        <PasswordField label="Confirm password" placeholder="Type it again" value={confirm} onChangeText={setConfirm} />
        <MatchNote password={password} confirm={confirm} />
        <View style={{ gap: 10 }}>
          <Txt size={13} weight={700}>
            Your level
          </Txt>
          <ChipRow wrap options={LEVEL_CODES.map((c) => ({ value: c, label: LEVEL_LABEL[c] }))} value={level} onChange={setLevel} />
          <Txt size={13} color={colors.muted}>
            You can change it later in your profile.
          </Txt>
        </View>
        <ErrorNote error={error} />
        <Row gap={4} style={{ justifyContent: 'center' }}>
          <Txt size={14} color={colors.muted}>
            Already a member?
          </Txt>
          <Pressable onPress={() => router.replace('/sign-in')} hitSlop={8}>
            <Txt size={14} weight={700} color={colors.royal}>
              Sign In
            </Txt>
          </Pressable>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
