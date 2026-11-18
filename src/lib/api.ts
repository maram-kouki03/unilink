import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/** Base URL of the Unilink backend, e.g. http://192.168.1.20:4000 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

if (!API_URL) {
  // eslint-disable-next-line no-console
  console.warn('Missing EXPO_PUBLIC_API_URL. Copy .env.example to .env and set it to http://<your PC IPv4>:4000');
}

export const ALLOWED_DOMAIN = process.env.EXPO_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? 'supcom.tn';

export const isAllowedEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

/* ───────────── Token storage (SecureStore on phones, AsyncStorage on web) ───────────── */

const TOKEN_KEY = 'unilink.token';
let token: string | null = null;

export async function loadToken(): Promise<string | null> {
  try {
    token = Platform.OS === 'web' ? await AsyncStorage.getItem(TOKEN_KEY) : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

export async function saveToken(value: string) {
  token = value;
  if (Platform.OS === 'web') await AsyncStorage.setItem(TOKEN_KEY, value);
  else await SecureStore.setItemAsync(TOKEN_KEY, value);
}

export async function clearToken() {
  token = null;
  try {
    if (Platform.OS === 'web') await AsyncStorage.removeItem(TOKEN_KEY);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // nothing stored
  }
}

export const getToken = () => token;

/* ───────────── 401 → logout ───────────── */

let onUnauthorized: (() => void) | null = null;

/** The AuthProvider registers its logout here; called when a signed-in request gets 401. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/* ───────────── fetch wrapper ───────────── */

/** Error answered by the server: status code + the whole JSON body (e.g. { error, needsVerification }). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Plain object → JSON. FormData → multipart (for files). */
  body?: unknown;
  query?: Query;
  timeoutMs?: number;
};

function buildUrl(path: string, query?: Query) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${API_URL}${path}${qs ? `?${qs}` : ''}`;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const sentToken = token;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? (isForm ? 180_000 : 20_000));

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      `Can't reach the Unilink server${API_URL ? ` at ${API_URL}` : ''}. Check that the backend is running and that your phone is on the same Wi-Fi as the PC.`,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && sentToken) onUnauthorized?.();
    const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const message = typeof body.error === 'string' ? body.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }
  return data as T;
}

/** A local file for a multipart FormData field (React Native format). */
export function formFile(uri: string, name: string, type?: string | null) {
  return { uri, name, type: type || 'application/octet-stream' } as unknown as Blob;
}
