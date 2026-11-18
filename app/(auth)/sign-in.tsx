import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Logo } from '@/components/Illustrations';
import { Button, ErrorNote, Field, IconButton, Row, Screen, Txt } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password, remember);
    } catch (e) {
      // Right password but the e-mail is not confirmed yet: the server just sent a fresh code.
      if (e instanceof ApiError && e.data.needsVerification) {
        const to = typeof e.data.email === 'string' ? e.data.email : email.trim().toLowerCase();
        router.push({ pathname: '/verify-email', params: { email: to } });
      } else {
        setError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  const forgot = () => router.push({ pathname: '/forgot-password', params: email.trim() ? { email: email.trim() } : {} });

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
        <Button title="Log In" arrow loading={busy} onPress={run} />
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
