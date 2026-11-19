import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MatchNote, PasswordField, PasswordStrength } from '@/components/auth';
import { Button, ErrorNote, Header, IconTile, Screen, Txt } from '@/components/ui';
import { passwordOk } from '@/lib/password';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

/** Step 3 of the password reset: choose the new password (the code was checked on reset-code). */
export default function NewPassword() {
  const { resetPassword } = useAuth();
  const params = useLocalSearchParams<{ resetToken?: string }>();
  const resetToken = String(params.resetToken ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(
    resetToken ? null : new Error('This reset link has expired. Please ask for a new code.'),
  );

  const canSubmit = !!resetToken && passwordOk(password) && password === confirm;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);
    try {
      // On success the session starts and the AuthGate opens Home.
      await resetPassword(resetToken, password);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen footer={<Button title="Save new password" variant="gradient" arrow loading={busy} disabled={!canSubmit} onPress={submit} />}>
        <Header title="" />
        <IconTile icon="lock" size={64} bg={colors.violetBg} color={colors.violet} />
        <View style={{ gap: 8 }}>
          <Txt size={30} weight={800} accessibilityRole="header">
            New password
          </Txt>
          <Txt size={15} color={colors.muted}>
            Choose a strong password. You will be signed in right after.
          </Txt>
        </View>
        <PasswordField label="New password" placeholder="Create a strong password" value={password} onChangeText={setPassword} />
        <PasswordStrength password={password} />
        <PasswordField label="Confirm password" placeholder="Type it again" value={confirm} onChangeText={setConfirm} />
        <MatchNote password={password} confirm={confirm} />
        <ErrorNote error={error} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
