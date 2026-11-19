import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { ALLOWED_DOMAIN, api, clearToken, isAllowedEmail, loadToken, saveToken, setUnauthorizedHandler } from '@/lib/api';
import { closeSocket, connectSocket } from '@/lib/socket';
import { passwordOk } from '@/lib/password';
import { LevelCode, Profile } from '@/types/db';

const REMEMBER_KEY = 'unilink.remember';

/** Same shape the screens already use: session.user.id */
export type Session = { user: { id: string; email: string } };

type AuthCtx = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  /** Saves a pending sign-up and e-mails a 6-digit code; the account is created by verifyEmail. */
  signUp: (p: { fullName: string; email: string; password: string; level: LevelCode }) => Promise<{ email: string; codeSent: boolean }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string, purpose: CodePurpose) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  /** Checks the reset code and returns a short-lived resetToken (kept in memory only, never stored). */
  verifyResetCode: (email: string, code: string) => Promise<string>;
  /** Saves the new password and starts the session. */
  resetPassword: (resetToken: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

export type CodePurpose = 'verify' | 'reset';

const normEmail = (email: string) => email.trim().toLowerCase();

const passwordError = () =>
  new Error('Password must have 8+ characters, an uppercase letter, a lowercase letter, a number and a special character.');

const Ctx = createContext<AuthCtx | null>(null);

const domainError = () => new Error(`Use your @${ALLOWED_DOMAIN} university e-mail.`);

const toSession = (p: Profile): Session => ({ user: { id: p.id, email: p.email } });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  /** Local logout: forget the token, close the socket, drop every cached query. */
  const clearLocal = useCallback(async () => {
    await clearToken();
    closeSocket();
    setSession(null);
    setProfile(null);
    queryClient.clear();
  }, [queryClient]);

  const startSession = useCallback(async (token: string, p: Profile) => {
    await saveToken(token);
    connectSocket(token);
    setProfile(p);
    setSession(toSession(p));
  }, []);

  // Restore the saved session on app start
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearLocal().catch(() => undefined);
    });
    (async () => {
      try {
        const token = await loadToken();
        if (!token) return;
        // "Remember me" unchecked → end the session when the app is reopened
        if ((await AsyncStorage.getItem(REMEMBER_KEY)) === '0') {
          await AsyncStorage.removeItem(REMEMBER_KEY);
          await clearToken();
          return;
        }
        const p = await api<Profile>('/me');
        connectSocket(token);
        setProfile(p);
        setSession(toSession(p));
      } catch {
        // Token expired → the 401 handler already cleared it.
        // Server unreachable → keep the token (it is restored on the next start) and show sign-in.
      } finally {
        setLoading(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, [clearLocal]);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    const p = await api<Profile>('/me');
    setProfile(p);
  }, [session]);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      profile,
      loading,
      async signIn(email, password, remember = true) {
        if (!isAllowedEmail(email)) throw domainError();
        const res = await api<{ token: string; profile: Profile }>('/auth/login', {
          body: { email: normEmail(email), password },
        });
        await AsyncStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
        await startSession(res.token, res.profile);
      },
      async signUp({ fullName, email, password, level }) {
        if (!isAllowedEmail(email)) throw domainError();
        if (!passwordOk(password)) throw passwordError();
        const res = await api<{ needsVerification: true; email: string; codeSent: boolean }>('/auth/signup', {
          body: { fullName: fullName.trim(), email: normEmail(email), password, level },
        });
        return { email: res.email, codeSent: res.codeSent };
      },
      async verifyEmail(email, code) {
        const res = await api<{ token: string; profile: Profile }>('/auth/verify-email', { body: { email: normEmail(email), code } });
        await AsyncStorage.setItem(REMEMBER_KEY, '1');
        await startSession(res.token, res.profile);
      },
      async resendCode(email, purpose) {
        await api('/auth/resend-code', { body: { email: normEmail(email), purpose } });
      },
      async forgotPassword(email) {
        if (!isAllowedEmail(email)) throw domainError();
        await api('/auth/forgot-password', { body: { email: normEmail(email) } });
      },
      async verifyResetCode(email, code) {
        const res = await api<{ resetToken: string }>('/auth/verify-reset-code', { body: { email: normEmail(email), code } });
        return res.resetToken;
      },
      async resetPassword(resetToken, password) {
        if (!passwordOk(password)) throw passwordError();
        const res = await api<{ token: string; profile: Profile }>('/auth/reset-password', {
          body: { resetToken, password },
        });
        await AsyncStorage.setItem(REMEMBER_KEY, '1');
        await startSession(res.token, res.profile);
      },
      async signOut() {
        await AsyncStorage.removeItem(REMEMBER_KEY);
        await clearLocal();
      },
      refreshProfile,
    }),
    [session, profile, loading, startSession, clearLocal, refreshProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
