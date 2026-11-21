import { one, query, transaction } from './db';
import { childTitle, extFromName, guessNumber, guessType } from './docs';
import { driveConfigured, driveFileUrl, driveFolderUrl, driveMeta, isGoogleDoc, listFolderRecursive } from './drive';
import { HttpError } from './http';
import * as sql from './sql/documents';

type FolderDoc = {
  id: string;
  subject_id: string;
  uploader_id: string | null;
  academic_year: string | null;
  type: sql.DocType;
  drive_file_id: string;
  title: string;
};

export type SyncResult = { folders: number; added: number; updated: number; hidden: number; restored: number; errors: string[] };

const emptyResult = (): SyncResult => ({ folders: 0, added: 0, updated: 0, hidden: 0, restored: 0, errors: [] });

/** One sync at a time per subject on this server. */
const running = new Map<string, Promise<SyncResult>>();

/**
 * Import every file of an approved Drive folder document (recursively) as approved child documents,
 * update changed files, hide files that are gone from Drive and bring back the ones that returned.
 */
export async function syncFolderDoc(folder: FolderDoc, subjectName: string, result: SyncResult = emptyResult()): Promise<SyncResult> {
  result.folders++;
  let files;
  try {
    files = await listFolderRecursive(folder.drive_file_id);
  } catch (err) {
    // Folder deleted or no longer public: its files are hidden until it comes back.
    if (err instanceof HttpError && err.status === 400) {
      const hidden = await query(
        `update public.documents set status = 'hidden', hidden_reason = 'drive_missing', updated_at = now()
          where parent_folder_doc_id = $1 and status = 'approved' returning id`,
        [folder.id],
      );
      result.hidden += hidden.length;
    }
    result.errors.push(`${folder.title}: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const existing = await query<{ id: string; drive_file_id: string; status: sql.DocStatus; hidden_reason: string | null; drive_modified_at: Date | null }>(
    sql.CHILDREN_STATE,
    [folder.id],
  );
  const byDriveId = new Map(existing.map((e) => [e.drive_file_id, e]));
  const present = new Set(files.map((f) => f.id));

  await transaction(async (db) => {
    for (const f of files) {
      const ext = isGoogleDoc(f.mimeType) ? 'pdf' : (extFromName(f.name) ?? 'file');
      const modified = f.modifiedTime ? new Date(f.modifiedTime) : null;
      const old = byDriveId.get(f.id);
      if (!old) {
        const type = guessType(f.name, f.path) ?? (folder.type !== 'other' ? folder.type : 'other');
        const inserted = await one(
          `insert into public.documents
             (subject_id, title, type, number, academic_year, source, status, uploader_id, file_name, file_ext,
              size_bytes, mime_type, drive_file_id, drive_url, drive_modified_at, parent_folder_doc_id, reviewed_at)
           values ($1, $2, $3, $4, $5, 'drive_file', 'approved', $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
           on conflict (parent_folder_doc_id, drive_file_id) where parent_folder_doc_id is not null do nothing
           returning id`,
          [
            folder.subject_id,
            childTitle(f.name, subjectName),
            type,
            guessNumber(f.name),
            folder.academic_year,
            folder.uploader_id,
            f.name.slice(0, 255),
            ext.slice(0, 10),
            f.size,
            f.mimeType,
            f.id,
            driveFileUrl(f.id),
            modified,
            folder.id,
          ],
          db,
        );
        if (inserted) result.added++;
        continue;
      }
      if (old.status === 'hidden' && old.hidden_reason === 'drive_missing') {
        await query(`update public.documents set status = 'approved', hidden_reason = null, updated_at = now() where id = $1`, [old.id], db);
        result.restored++;
      }
      if (modified && (!old.drive_modified_at || old.drive_modified_at.getTime() !== modified.getTime())) {
        await query(
          `update public.documents set file_name = $2, file_ext = $3, size_bytes = $4, mime_type = $5,
                  drive_modified_at = $6, updated_at = now() where id = $1`,
          [old.id, f.name.slice(0, 255), ext.slice(0, 10), f.size, f.mimeType, modified],
          db,
        );
        result.updated++;
      }
    }
    for (const e of existing) {
      if (!present.has(e.drive_file_id) && e.status === 'approved') {
        await query(`update public.documents set status = 'hidden', hidden_reason = 'drive_missing', updated_at = now() where id = $1`, [e.id], db);
        result.hidden++;
      }
    }
    await query(`update public.documents set updated_at = now() where id = $1`, [folder.id], db);
  });
  return result;
}

/** The subject's official Drive folder (subjects.drive_folder_id) is kept as an approved folder document. */
async function ensureSubjectFolderDoc(subject: { id: string; name: string; drive_folder_id: string }) {
  if (await one(sql.FOLDER_DOC_FOR, [subject.id, subject.drive_folder_id])) return;
  const meta = await driveMeta(subject.drive_folder_id, 'folder');
  await one(
    `insert into public.documents
       (subject_id, title, type, source, status, file_name, file_ext, mime_type, drive_file_id, drive_url, reviewed_at)
     values ($1, $2, 'other', 'drive_folder', 'approved', $3, 'folder', $4, $5, $6, now())
     returning id`,
    [subject.id, `Drive – ${subject.name}`.slice(0, 140), meta.name.slice(0, 255), meta.mimeType, subject.drive_folder_id, driveFolderUrl(subject.drive_folder_id)],
  );
}

/** Sync every Drive folder of a subject. Never runs twice at the same time for one subject. */
export function syncSubject(subjectId: string): Promise<SyncResult> {
  const current = running.get(subjectId);
  if (current) return current;
  const job = (async () => {
    const result = emptyResult();
    if (!driveConfigured()) {
      result.errors.push('GOOGLE_API_KEY is not set on the server');
      return result;
    }
    const subject = await one<{ id: string; name: string; drive_folder_id: string | null }>(sql.SUBJECT_LEVEL, [subjectId]);
    if (!subject) return result;
    if (subject.drive_folder_id) {
      try {
        await ensureSubjectFolderDoc({ ...subject, drive_folder_id: subject.drive_folder_id });
      } catch (err) {
        result.errors.push(`subject folder: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const folders = await query<FolderDoc>(sql.FOLDERS_OF_SUBJECT, [subjectId]);
    for (const folder of folders) await syncFolderDoc(folder, subject.name, result);
    await query(sql.TOUCH_SUBJECT_SYNC, [subjectId]);
    return result;
  })().finally(() => running.delete(subjectId));
  running.set(subjectId, job);
  return job;
}

const logFailure = (what: string) => (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[drive-sync] ${what}:`, err instanceof Error ? err.message : err);
};

/** Background re-sync when a subject is opened and its last sync is older than 6 hours. */
export function maybeSyncSubject(subjectId: string) {
  if (!driveConfigured()) return;
  void one(sql.CLAIM_SUBJECT_SYNC, [subjectId])
    .then((claimed) => (claimed ? syncSubject(subjectId) : null))
    .catch(logFailure(`subject ${subjectId}`));
}

/** Background import right after a folder document is approved. */
export function importFolderInBackground(folderDocId: string) {
  if (!driveConfigured()) return;
  void (async () => {
    const folder = await one<FolderDoc & { subject_name: string }>(
      `select d.id, d.subject_id, d.uploader_id, d.academic_year, d.type, d.drive_file_id, d.title, s.name as subject_name
         from public.documents d join public.subjects s on s.id = d.subject_id
        where d.id = $1 and d.source = 'drive_folder' and d.status = 'approved'`,
      [folderDocId],
    );
    if (folder) await syncFolderDoc(folder, folder.subject_name);
  })().catch(logFailure(`folder ${folderDocId}`));
}

/** Sync many subjects one after the other, in the background. */
export function syncSubjectsInBackground(subjectIds: string[]) {
  void (async () => {
    for (const id of subjectIds) await syncSubject(id).catch(logFailure(`subject ${id}`));
  })();
}
