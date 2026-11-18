import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CodeInput, useCountdown } from '@/components/auth';
import { Button, ErrorNote, Header, IconTile, Row, Screen, Txt } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

const RESEND_SECONDS = 60;

export default function VerifyEmail() {
  const { verifyEmail, resendCode } = useAuth();
  const params = useLocalSearchParams<{ email?: string; sent?: string }>();
  const email = String(params.email ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<unknown>(params.sent === '0' ? new Error('We could not send the e-mail. Tap "Resend code".') : null);
  const [info, setInfo] = useState<string | null>(null);
  // A code was just sent by sign-up / sign-in: wait 60 s before the next one.
  const [left, setLeft] = useCountdown(params.sent === '0' ? 0 : RESEND_SECONDS);

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      // On success the session starts and the AuthGate opens Home.
      await verifyEmail(email, value);
    } catch (e) {
      setError(e);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  // Verify as soon as the 6th digit is typed or pasted.
  useEffect(() => {
    if (code.length === 6) verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await resendCode(email, 'verify');
      setInfo(`A new code was sent to ${email}.`);
      setLeft(RESEND_SECONDS);
    } catch (e) {
      setError(e);
      const wait = e instanceof ApiError ? Number(e.data.retryAfter) : NaN;
      if (wait > 0 && wait <= RESEND_SECONDS) setLeft(wait);
    } finally {
      setResending(false);
    }
  };

  // Back to sign-up (returns to the filled form when we came from there).
  const changeEmail = () => router.dismissTo('/sign-up');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ gap: 18 }}>
        <Header title="" />
        <IconTile icon="mail" size={64} bg={colors.violetBg} color={colors.violet} />
        <View style={{ gap: 8 }}>
          <Txt size={30} weight={800} accessibilityRole="header">
            Check your inbox
          </Txt>
          <Txt size={15} color={colors.muted}>
            We sent a 6-digit code to
          </Txt>
          <Txt size={15} weight={700} color={colors.navy}>
            {email}
          </Txt>
          <Txt size={13} color={colors.muted}>
            It expires in 15 minutes. Check your spam folder too.
          </Txt>
        </View>
        <CodeInput value={code} onChange={setCode} />
        <ErrorNote error={error} />
        {info ? (
          <View style={{ backgroundColor: colors.successBg, borderRadius: 14, padding: 12 }}>
            <Txt size={13} weight={600} color={colors.success}>
              {info}
            </Txt>
          </View>
        ) : null}
        <Button title="Verify" variant="gradient" arrow loading={busy} disabled={code.length !== 6} onPress={() => verify()} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={resend} disabled={left > 0 || resending} hitSlop={8} accessibilityRole="button" accessibilityState={{ disabled: left > 0 || resending }}>
            <Txt size={14} weight={700} color={left > 0 || resending ? colors.muted : colors.royal}>
              {resending ? 'Sending…' : left > 0 ? `Resend code in ${left}s` : 'Resend code'}
            </Txt>
          </Pressable>
          <Pressable onPress={changeEmail} hitSlop={8} accessibilityRole="button">
            <Txt size={14} weight={700} color={colors.royal}>
              Change e-mail
            </Txt>
          </Pressable>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
