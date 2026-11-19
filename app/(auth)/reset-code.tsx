import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CodeInput, useCountdown } from '@/components/auth';
import { ErrorNote, Header, IconTile, Screen, Txt } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

const RESEND_SECONDS = 60;

/** Step 2 of the password reset: the 6-digit code only. */
export default function ResetCode() {
  const { verifyResetCode, resendCode } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);
  // forgot-password just sent a code: wait 60 s before the next one.
  const [left, setLeft] = useCountdown(RESEND_SECONDS);

  const verify = async (value: string) => {
    if (value.length !== 6 || busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const resetToken = await verifyResetCode(email, value);
      // replace: the code is used up, "back" from the next screen returns to the e-mail step.
      // The token only lives in the navigation params (memory), never on disk.
      router.replace({ pathname: '/new-password', params: { resetToken } });
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
      <Screen contentStyle={{ gap: 18 }}>
        <Header title="" />
        <IconTile icon="mail" size={64} bg={colors.violetBg} color={colors.violet} />
        <View style={{ gap: 8 }}>
          <Txt size={30} weight={800} accessibilityRole="header">
            Enter the code
          </Txt>
          <Txt size={15} color={colors.muted}>
            If an account exists for <Txt size={15} weight={700} color={colors.navy}>{email}</Txt>, we sent it a 6-digit code.
          </Txt>
          <Txt size={13} color={colors.muted}>
            It expires in 15 minutes. Check your spam folder too.
          </Txt>
        </View>
        <CodeInput value={code} onChange={setCode} />
        {busy ? (
          <Txt size={14} weight={600} color={colors.muted}>
            Checking…
          </Txt>
        ) : null}
        <ErrorNote error={error} />
        {info ? (
          <View style={{ backgroundColor: colors.successBg, borderRadius: 14, padding: 12 }}>
            <Txt size={13} weight={600} color={colors.success}>
              {info}
            </Txt>
          </View>
        ) : null}
        <Pressable onPress={resend} disabled={left > 0 || resending} hitSlop={8} accessibilityRole="button" accessibilityState={{ disabled: left > 0 || resending }}>
          <Txt size={14} weight={700} color={left > 0 || resending ? colors.muted : colors.royal}>
            {resending ? 'Sending…' : left > 0 ? `Resend code in ${left}s` : 'Resend code'}
          </Txt>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}
