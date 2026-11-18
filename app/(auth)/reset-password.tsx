import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CodeInput, MatchNote, PasswordField, PasswordStrength, useCountdown } from '@/components/auth';
import { Button, ErrorNote, Header, Screen, Txt } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { passwordOk } from '@/lib/password';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

const RESEND_SECONDS = 60;

export default function ResetPassword() {
  const { resetPassword, resendCode } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [left, setLeft] = useCountdown(RESEND_SECONDS);

  const canSubmit = code.length === 6 && passwordOk(password) && password === confirm;

  const submit = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      // On success the session starts and the AuthGate opens Home.
      await resetPassword(email, code, password);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await resendCode(email, 'reset');
      setInfo('If an account exists for this e-mail, a new code was sent.');
      setLeft(RESEND_SECONDS);
    } catch (e) {
      setError(e);
      const wait = e instanceof ApiError ? Number(e.data.retryAfter) : NaN;
      if (wait > 0 && wait <= RESEND_SECONDS) setLeft(wait);
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Save new password" variant="gradient" arrow loading={busy} disabled={!canSubmit} onPress={submit} />}>
        <Header title="" />
        <View style={{ gap: 8 }}>
          <Txt size={30} weight={800} accessibilityRole="header">
            New password
          </Txt>
          <Txt size={15} color={colors.muted}>
            If an account exists for <Txt size={15} weight={700} color={colors.navy}>{email}</Txt>, we sent it a 6-digit code. It expires in 15 minutes.
          </Txt>
        </View>
        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700}>
            Code
          </Txt>
          <CodeInput value={code} onChange={setCode} />
        </View>
        <Pressable onPress={resend} disabled={left > 0 || resending} hitSlop={8} accessibilityRole="button" accessibilityState={{ disabled: left > 0 || resending }}>
          <Txt size={14} weight={700} color={left > 0 || resending ? colors.muted : colors.royal}>
            {resending ? 'Sending…' : left > 0 ? `Resend code in ${left}s` : 'Resend code'}
          </Txt>
        </Pressable>
        <PasswordField label="New password" placeholder="Create a strong password" value={password} onChangeText={setPassword} />
        <PasswordStrength password={password} />
        <PasswordField label="Confirm password" placeholder="Type it again" value={confirm} onChangeText={setConfirm} />
        <MatchNote password={password} confirm={confirm} />
        <ErrorNote error={error} />
        {info ? (
          <View style={{ backgroundColor: colors.successBg, borderRadius: 14, padding: 12 }}>
            <Txt size={13} weight={600} color={colors.success}>
              {info}
            </Txt>
          </View>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
