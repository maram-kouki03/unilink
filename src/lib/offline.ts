import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { saveOffline } from './storage';
import { DocumentRow } from '@/types/db';

/** Documents saved on this phone: the file is in documentDirectory/offline/, the list in AsyncStorage. */
export type OfflineDoc = {
  id: string;
  title: string;
  file_ext: string;
  size_bytes: number | null;
  subject: string | null;
  uri: string;
  saved_at: string;
};

const KEY = 'unilink.offlineDocs';
export const offlineKey = ['offlineDocs'] as const;

async function read(): Promise<OfflineDoc[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OfflineDoc[]) : [];
  } catch {
    return [];
  }
}

const write = (list: OfflineDoc[]) => AsyncStorage.setItem(KEY, JSON.stringify(list));

/** Saved documents whose file still exists (works without internet). */
export async function listOffline(): Promise<OfflineDoc[]> {
  const list = await read();
  const checked = await Promise.all(
    list.map(async (d) => ((await FileSystem.getInfoAsync(d.uri).catch(() => ({ exists: false }))).exists ? d : null)),
  );
  const alive = checked.filter((d): d is OfflineDoc => !!d);
  if (alive.length !== list.length) await write(alive);
  return alive;
}

export const fileNameOf = (d: Pick<DocumentRow, 'file_name' | 'title' | 'file_ext'>) => {
  const base = d.file_name || d.title;
  return /\.[a-z0-9]{1,8}$/i.test(base) ? base : `${base}.${d.file_ext || 'pdf'}`;
};

/** Download the document into the app folder and remember it. */
export async function saveDocOffline(d: DocumentRow) {
  const name = `${d.id.slice(0, 8)}-${fileNameOf(d)}`;
  const uri = await saveOffline(d.id, name);
  const list = (await read()).filter((x) => x.id !== d.id);
  list.unshift({
    id: d.id,
    title: d.title,
    file_ext: d.file_ext,
    size_bytes: d.size_bytes,
    subject: d.subject?.name ?? null,
    uri,
    saved_at: new Date().toISOString(),
  });
  await write(list);
  return uri;
}

export async function removeOffline(id: string) {
  const list = await read();
  const doc = list.find((x) => x.id === id);
  if (doc) await FileSystem.deleteAsync(doc.uri, { idempotent: true }).catch(() => undefined);
  await write(list.filter((x) => x.id !== id));
}

export function useOfflineDocs() {
  return useQuery({ queryKey: offlineKey, queryFn: listOffline, staleTime: 0, networkMode: 'always' });
}

export function useRefreshOffline() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: offlineKey });
}
