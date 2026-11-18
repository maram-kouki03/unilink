import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api, API_URL } from './api';

export const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

/** Public URL of an item / lost & found photo: a full Cloudinary URL, or an old "images/<file>" path on the backend. */
export function publicImageUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_URL}/uploads/${path}`;
}

/** Signed link to a private document (valid 1 hour). */
export async function signedDocUrl(documentId: string) {
  const { url } = await api<{ url: string }>(`/documents/${documentId}/link`);
  return url;
}

const safeName = (fileName: string) => fileName.replace(/[^\w.\- ]+/g, '_');

/** Download a document to the device cache and open the share sheet (Save to Files / Drive / etc.). */
export async function downloadAndShare(documentId: string, fileName: string) {
  const url = await signedDocUrl(documentId);
  const res = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${safeName(fileName)}`);
  if (res.status >= 400) throw new Error('The file could not be downloaded.');
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri);
  return res.uri;
}

/** Keep a copy in the app's document directory so it opens offline. */
export async function saveOffline(documentId: string, fileName: string) {
  const url = await signedDocUrl(documentId);
  const dir = `${FileSystem.documentDirectory}offline/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const res = await FileSystem.downloadAsync(url, dir + safeName(fileName));
  if (res.status >= 400) throw new Error('The file could not be downloaded.');
  return res.uri;
}
