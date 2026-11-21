import { config } from './config';
import { HttpError } from './http';

/**
 * Google Drive API v3, read-only, with the server's API key (never sent to the app).
 * Works only for files and folders shared as "Anyone with the link".
 */

const API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GOOGLE_APPS_PREFIX = 'application/vnd.google-apps.';
/** Google files that can be exported to PDF. Others (forms, sites, shortcuts, maps…) are skipped. */
const EXPORTABLE = new Set(['document', 'spreadsheet', 'presentation', 'drawing'].map((t) => GOOGLE_APPS_PREFIX + t));

/** Recursive folder import limits (a runaway folder must not block the server). */
const MAX_DEPTH = 8;
const MAX_FILES = 2000;

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  trashed: boolean;
};

export type DriveTreeFile = DriveFile & { path: string[] };

export const isFolderMime = (mime: string) => mime === FOLDER_MIME;
export const isGoogleDoc = (mime: string) => mime.startsWith(GOOGLE_APPS_PREFIX);
/** Regular files and exportable Google files can be stored as documents. */
export const isImportable = (mime: string) => !isGoogleDoc(mime) || EXPORTABLE.has(mime);

export const driveFileUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;
export const driveFolderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

const ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * File or folder id from any Drive link:
 * /file/d/<id>, /folders/<id>, /document/d/<id>, /open?id=<id>, /uc?id=<id>, …, or a bare id.
 */
export function parseDriveId(input: string): string | null {
  const raw = input.trim();
  if (ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!['drive.google.com', 'docs.google.com'].includes(url.hostname.toLowerCase())) return null;
  const byPath = /\/(?:file|document|spreadsheets|presentation|drawings|forms)\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/.exec(url.pathname)
    ?? /\/folders\/([A-Za-z0-9_-]+)/.exec(url.pathname);
  const id = byPath?.[1] ?? url.searchParams.get('id');
  return id && ID_RE.test(id) ? id : null;
}

export const driveConfigured = () => !!config.googleApiKey;

function requireKey(): string {
  if (!config.googleApiKey) throw new HttpError(503, 'Google Drive links are not available yet (the server has no Google API key).');
  return config.googleApiKey;
}

type DriveErrorBody = { error?: { code?: number; message?: string; errors?: { reason?: string }[] } };

/** Turn a Drive API error into a clear HttpError. `what` is 'file' or 'folder'. */
async function driveError(res: Response, what: 'file' | 'folder'): Promise<HttpError> {
  const body = (await res.json().catch(() => null)) as DriveErrorBody | null;
  const reason = body?.error?.errors?.[0]?.reason ?? '';
  if (/rateLimit|dailyLimit|quota/i.test(reason) || res.status === 429) {
    return new HttpError(503, 'Google Drive is busy right now. Please try again in a few minutes.');
  }
  if (/keyInvalid|keyExpired|accessNotConfigured|ipRefererBlocked/i.test(reason) || res.status === 400) {
    // eslint-disable-next-line no-console
    console.error(`[drive] API key problem: ${res.status} ${reason} ${body?.error?.message ?? ''}`);
    return new HttpError(503, 'Google Drive is not available right now. Please try again later.');
  }
  if (res.status === 404 || res.status === 403 || res.status === 401) {
    return new HttpError(400, `Share the ${what} as 'Anyone with the link' (or check the link), then try again.`);
  }
  // eslint-disable-next-line no-console
  console.error(`[drive] ${res.status} ${reason} ${body?.error?.message ?? ''}`);
  return new HttpError(502, 'Google Drive did not answer. Please try again.');
}

async function driveFetch(path: string, params: Record<string, string>, timeoutMs = 15_000): Promise<Response> {
  const qs = new URLSearchParams({ ...params, key: requireKey(), supportsAllDrives: 'true' });
  try {
    return await fetch(`${API}${path}?${qs}`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new HttpError(502, 'Google Drive did not answer. Please try again.');
  }
}

const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,trashed';

const toFile = (f: Record<string, any>): DriveFile => ({
  id: String(f.id),
  name: String(f.name ?? 'Untitled'),
  mimeType: String(f.mimeType ?? 'application/octet-stream'),
  size: f.size != null && Number.isFinite(Number(f.size)) ? Number(f.size) : null,
  modifiedTime: f.modifiedTime ?? null,
  trashed: !!f.trashed,
});

/** Metadata of one public file or folder. Throws 400 "Share the … as 'Anyone with the link'" if not reachable. */
export async function driveMeta(id: string, what: 'file' | 'folder'): Promise<DriveFile> {
  const res = await driveFetch(`/files/${encodeURIComponent(id)}`, { fields: FILE_FIELDS });
  if (!res.ok) throw await driveError(res, what);
  const file = toFile((await res.json()) as Record<string, any>);
  if (file.trashed) throw new HttpError(400, `This ${what} is in the Drive trash.`);
  return file;
}

/** Direct children of a folder (every page). */
async function listChildren(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await driveFetch('/files', {
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '1000',
      includeItemsFromAllDrives: 'true',
      ...(pageToken ? { pageToken } : {}),
    });
    if (!res.ok) throw await driveError(res, 'folder');
    const json = (await res.json()) as { nextPageToken?: string; files?: Record<string, any>[] };
    for (const f of json.files ?? []) out.push(toFile(f));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

/** Every importable file under a folder, with the names of the sub-folders it sits in. */
export async function listFolderRecursive(folderId: string): Promise<DriveTreeFile[]> {
  const out: DriveTreeFile[] = [];
  const seen = new Set<string>([folderId]);
  const queue: { id: string; path: string[] }[] = [{ id: folderId, path: [] }];
  while (queue.length && out.length < MAX_FILES) {
    const { id, path } = queue.shift()!;
    for (const f of await listChildren(id)) {
      if (isFolderMime(f.mimeType)) {
        if (path.length + 1 <= MAX_DEPTH && !seen.has(f.id)) {
          seen.add(f.id);
          queue.push({ id: f.id, path: [...path, f.name] });
        }
      } else if (isImportable(f.mimeType) && !seen.has(f.id)) {
        seen.add(f.id);
        out.push({ ...f, path });
        if (out.length >= MAX_FILES) break;
      }
    }
  }
  return out;
}

/**
 * Open a download stream for a Drive file: alt=media for normal files,
 * export to PDF for Google Docs/Sheets/Slides/Drawings.
 */
export async function driveDownload(id: string, mimeType: string | null): Promise<{ res: Response; exported: boolean }> {
  const exported = !!mimeType && isGoogleDoc(mimeType);
  const res = exported
    ? await driveFetch(`/files/${encodeURIComponent(id)}/export`, { mimeType: 'application/pdf' }, 120_000)
    : await driveFetch(`/files/${encodeURIComponent(id)}`, { alt: 'media' }, 120_000);
  if (!res.ok) throw await driveError(res, 'file');
  return { res, exported };
}
