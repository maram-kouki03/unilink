import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api, API_URL, getToken } from './api';

export const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();

/** Public URL of an item / lost & found photo: a full Cloudinary URL, or an old "images/<file>" path on the backend. */
export function publicImageUrl(path?: string | null) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_URL}/uploads/${path}`;
}

/** Link to a document: signed Cloudinary link (valid 1 hour) or its Google Drive page. */
export async function signedDocUrl(documentId: string) {
  const { url } = await api<{ url: string }>(`/documents/${documentId}/link`);
  return url;
}

/** GET /documents/:id/download with the session token (counts the download; Drive files come through the server). */
function downloadRequest(documentId: string) {
  const token = getToken();
  return { url: `${API_URL}/documents/${documentId}/download`, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

const safeName = (fileName: string) => fileName.replace(/[^\w.\- ]+/g, '_');

/** Download a document to the device cache and open the share sheet (Save to Files / Drive / etc.). */
export async function downloadAndShare(documentId: string, fileName: string) {
  const { url, headers } = downloadRequest(documentId);
  const res = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${safeName(fileName)}`, { headers });
  if (res.status >= 400) throw new Error('The file could not be downloaded.');
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(res.uri);
  return res.uri;
}

/** Keep a copy in the app's document directory so it opens offline. */
export async function saveOffline(documentId: string, fileName: string) {
  const { url, headers } = downloadRequest(documentId);
  const dir = `${FileSystem.documentDirectory}offline/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const res = await FileSystem.downloadAsync(url, dir + safeName(fileName), { headers });
  if (res.status >= 400) throw new Error('The file could not be downloaded.');
  return res.uri;
}
