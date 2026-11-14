import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { config } from './config';
import { HttpError } from './http';

for (const dir of [config.documentsDir, config.imagesDir]) fs.mkdirSync(dir, { recursive: true });

const DOC_EXTS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

export const extOf = (name: string) => (path.extname(name).slice(1) || '').toLowerCase();

/** Multer decodes file names as latin1; React Native sends UTF-8. */
export const originalName = (file: Express.Multer.File) => Buffer.from(file.originalname, 'latin1').toString('utf8');

function storage(dir: string) {
  return multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}.${extOf(originalName(file)) || 'bin'}`),
  });
}

/** Private documents: uploads/documents, 50 MB. */
export const uploadDocument = multer({
  storage: storage(config.documentsDir),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (DOC_EXTS.includes(extOf(originalName(file)))) cb(null, true);
    else cb(new HttpError(400, 'Allowed files: PDF, Word, PowerPoint, Excel, PNG, JPG'));
  },
});

/** Public images: uploads/images, 5 MB. */
export const uploadImage = multer({
  storage: storage(config.imagesDir),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okExt = IMAGE_EXTS.includes(extOf(originalName(file)));
    const okMime = !file.mimetype || file.mimetype.startsWith('image/');
    if (okExt && okMime) cb(null, true);
    else cb(new HttpError(400, 'Allowed images: JPG, PNG, WEBP'));
  },
});

/** Path stored in the database for an uploaded file, e.g. "images/<uuid>.jpg". */
export const storedPath = (kind: 'documents' | 'images', file: Express.Multer.File) => `${kind}/${file.filename}`;

/** Absolute path of a stored file, refusing anything outside UPLOAD_DIR. */
export function absolutePath(stored: string): string | null {
  const abs = path.resolve(config.uploadDir, stored);
  return abs.startsWith(config.uploadDir + path.sep) ? abs : null;
}

/** Delete a stored file (or an uploaded multer file) and ignore errors. */
export async function removeFile(fileOrStored: Express.Multer.File | string | null | undefined) {
  if (!fileOrStored) return;
  const abs = typeof fileOrStored === 'string' ? absolutePath(fileOrStored) : fileOrStored.path;
  if (abs) await fs.promises.unlink(abs).catch(() => undefined);
}
