import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { ALLOWED_DOMAIN, isAllowedEmail, supabase } from '@/lib/supabase';
import { LevelCode, Profile } from '@/types/db';

WebBrowser.maybeCompleteAuthSession();

const REMEMBER_KEY = 'unilink.remember';

type AuthCtx = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, remember?: boolean) => Promise<void>;
  signUp: (p: { fullName: string; email: string; password: string; level: LevelCode }) => Promise<{ needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const domainError = () => new Error(`Use your @${ALLOWED_DOMAIN} university e-mail.`);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId?: string) => {
    if (!userId) return setProfile(null);
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // "Remember me" unchecked → end the session when the app is reopened
      if (data.session && (await AsyncStorage.getItem(REMEMBER_KEY)) === '0') {
        await AsyncStorage.removeItem(REMEMBER_KEY);
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadProfile(s?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: AuthCtx = {
    session,
    profile,
    loading,
    async signIn(email, password, remember = true) {
      if (!isAllowedEmail(email)) throw domainError();
      await AsyncStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw new Error(error.message);
    },
    async signUp({ fullName, email, password, level }) {
      if (!isAllowedEmail(email)) throw domainError();
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: fullName.trim(), level }, emailRedirectTo: Linking.createURL('/') },
      });
      if (error) throw new Error(error.message);
      return { needsConfirmation: !data.session };
    },
    async signInWithGoogle() {
      const redirectTo = Linking.createURL('/auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' } },
      });
      if (error) throw new Error(error.message);
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success') return;
      // Tokens come back in the URL fragment (#access_token=...&refresh_token=...)
      const fragment = res.url.split('#')[1] ?? res.url.split('?')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const code = params.get('code');
      if (code) {
        const { error: e } = await supabase.auth.exchangeCodeForSession(code);
        if (e) throw new Error(e.message);
      } else {
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (!access_token || !refresh_token) throw new Error('Google sign-in was cancelled.');
        const { error: e } = await supabase.auth.setSession({ access_token, refresh_token });
        if (e) throw new Error(e.message);
      }
      const { data: u } = await supabase.auth.getUser();
      if (u.user?.email && !isAllowedEmail(u.user.email)) {
        await supabase.auth.signOut();
        throw domainError();
      }
    },
    async resetPassword(email) {
      if (!isAllowedEmail(email)) throw domainError();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    refreshProfile: () => loadProfile(session?.user.id),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
