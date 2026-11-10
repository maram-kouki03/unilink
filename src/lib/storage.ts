import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export const BUCKET_DOCS = 'documents';
export const BUCKET_IMAGES = 'images';

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

/** Upload a local file:// uri to a Supabase Storage bucket. Returns the object path. */
export async function uploadLocalFile(opts: {
  bucket: string;
  folder: string;
  uri: string;
  fileName: string;
  contentType?: string;
}): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(opts.uri, { encoding: 'base64' });
  const path = `${opts.folder}/${uuid()}.${extOf(opts.fileName) || 'bin'}`;
  const { error } = await supabase.storage
    .from(opts.bucket)
    .upload(path, decode(base64), { contentType: opts.contentType ?? 'application/octet-stream', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export function publicImageUrl(path?: string | null) {
  if (!path) return null;
  return supabase.storage.from(BUCKET_IMAGES).getPublicUrl(path).data.publicUrl;
}

export async function signedDocUrl(path: string, expiresIn = 60 * 60) {
  const { data, error } = await supabase.storage.from(BUCKET_DOCS).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Download a document to the device cache and open the share sheet (Save to Files / Drive / etc.). */
export async function downloadAndShare(path: string, fileName: string) {
  const url = await signedDocUrl(path, 300);
  const safe = fileName.replace(/[^\w.\- ]+/g, '_');
  const target = `${FileSystem.cacheDirectory}${safe}`;
  const res = await FileSystem.downloadAsync(url, target);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri);
  return res.uri;
}

/** Keep a copy in the app's document directory so it opens offline. */
export async function saveOffline(path: string, fileName: string) {
  const url = await signedDocUrl(path, 300);
  const dir = `${FileSystem.documentDirectory}offline/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const res = await FileSystem.downloadAsync(url, dir + fileName.replace(/[^\w.\- ]+/g, '_'));
  return res.uri;
}
