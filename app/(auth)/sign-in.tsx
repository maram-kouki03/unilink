import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Logo } from '@/components/Illustrations';
import { Button, ErrorNote, Field, IconButton, Row, Screen, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

export default function SignIn() {
  const { signIn, signInWithGoogle, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<unknown>(null);

  const run = async (kind: 'email' | 'google') => {
    setError(null);
    setBusy(kind);
    try {
      if (kind === 'email') await signIn(email, password, remember);
      else await signInWithGoogle();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const forgot = async () => {
    try {
      await resetPassword(email);
      Alert.alert('Check your inbox', 'We sent you a link to reset your password.');
    } catch (e) {
      setError(e);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ paddingTop: 24, gap: 18 }}>
        <Row gap={10}>
          <Logo size={40} />
          <Txt size={24} weight={800} color={colors.navy}>
            Unilink
          </Txt>
        </Row>
        <View style={{ gap: 8, marginTop: 20 }}>
          <Txt size={32} weight={800} accessibilityRole="header">
            Sign In
          </Txt>
          <Txt size={15} color={colors.muted}>
            Connect to your SUP'COM account
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
        />
        <Field
          label="Password"
          icon="lock"
          placeholder="Your password"
          secureTextEntry={!show}
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          right={<IconButton icon="eye" label={show ? 'Hide password' : 'Show password'} bg="transparent" color={colors.muted} onPress={() => setShow(!show)} />}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} onPress={() => setRemember(!remember)} hitSlop={8}>
            <Row gap={10}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  backgroundColor: remember ? colors.navy : colors.card,
                  borderWidth: 1.5,
                  borderColor: colors.navy,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {remember ? <Icon name="check" size={13} color={colors.white} /> : null}
              </View>
              <Txt size={14}>Remember me</Txt>
            </Row>
          </Pressable>
          <Pressable onPress={forgot} hitSlop={8}>
            <Txt size={14} weight={700} color={colors.royal}>
              Forgot password?
            </Txt>
          </Pressable>
        </Row>
        <ErrorNote error={error} />
        <Button title="Log In" arrow loading={busy === 'email'} onPress={() => run('email')} />
        <Row gap={12}>
          <View style={{ flex: 1, height: 1, backgroundColor: '#DCDDF0' }} />
          <Txt size={13} color={colors.muted}>
            or
          </Txt>
          <View style={{ flex: 1, height: 1, backgroundColor: '#DCDDF0' }} />
        </Row>
        <Button title="Continue with Google" variant="outline" loading={busy === 'google'} onPress={() => run('google')} />
        <Row gap={4} style={{ justifyContent: 'center', marginTop: 12 }}>
          <Txt size={14} color={colors.muted}>
            Don't have an account?
          </Txt>
          <Pressable onPress={() => router.replace('/sign-up')} hitSlop={8}>
            <Txt size={14} weight={700} color={colors.royal}>
              Sign Up
            </Txt>
          </Pressable>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
