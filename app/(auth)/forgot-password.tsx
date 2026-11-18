import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, ErrorNote, Field, Header, IconTile, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(String(params.email ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      await forgotPassword(email);
      router.push({ pathname: '/reset-password', params: { email: email.trim().toLowerCase() } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ gap: 18 }}>
        <Header title="" />
        <IconTile icon="lock" size={64} bg={colors.violetBg} color={colors.violet} />
        <View style={{ gap: 8 }}>
          <Txt size={30} weight={800} accessibilityRole="header">
            Forgot password?
          </Txt>
          <Txt size={15} color={colors.muted}>
            Enter your university e-mail. We will send you a 6-digit code to choose a new password.
          </Txt>
        </View>
        <Field
          label="University email"
          icon="mail"
          placeholder="name@supcom.tn"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <ErrorNote error={error} />
        <Button title="Send code" variant="gradient" arrow loading={busy} disabled={!email.trim()} onPress={send} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
