import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';
import { config } from './config';
import { HttpError } from './http';

/**
 * Files live on Cloudinary (the server disk is wiped on every restart on Render).
 *  - documents: private (type "authenticated") in unilink/documents, opened with a signed link valid 1 hour
 *  - images:    public in unilink/images, the full https URL is stored in photo_path
 */
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

const DOC_FOLDER = 'unilink/documents';
const IMAGE_FOLDER = 'unilink/images';
const AVATAR_FOLDER = 'unilink/avatars';
const SIGNED_LINK_SECONDS = 60 * 60;

const DOC_EXTS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg'];
/** Documents that Cloudinary stores as images; everything else (PDF, Office) is stored as "raw". */
const DOC_IMAGE_EXTS = ['png', 'jpg', 'jpeg'];
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

export type ResourceType = 'image' | 'raw';

export const extOf = (name: string) => (path.extname(name).slice(1) || '').toLowerCase();

/** Multer decodes file names as latin1; React Native sends UTF-8. */
export const originalName = (file: Express.Multer.File) => Buffer.from(file.originalname, 'latin1').toString('utf8');

/** Private documents, 50 MB, kept in memory then sent to Cloudinary. */
export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (DOC_EXTS.includes(extOf(originalName(file)))) cb(null, true);
    else cb(new HttpError(400, 'Allowed files: PDF, Word, PowerPoint, Excel, PNG, JPG'));
  },
});

/** Public images, 5 MB, kept in memory then sent to Cloudinary. */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okExt = IMAGE_EXTS.includes(extOf(originalName(file)));
    const okMime = !file.mimetype || file.mimetype.startsWith('image/');
    if (okExt && okMime) cb(null, true);
    else cb(new HttpError(400, 'Allowed images: JPG, PNG, WEBP'));
  },
});

function uploadBuffer(buffer: Buffer, options: UploadApiOptions): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (result && !err) return resolve(result);
      // eslint-disable-next-line no-console
      console.error('[cloudinary] upload failed:', err?.message ?? err);
      if (/file size too large/i.test(err?.message ?? '')) return reject(new HttpError(413, 'File is too large'));
      reject(new HttpError(502, 'The file could not be stored. Please try again.'));
    });
    stream.end(buffer);
  });
}

export type StoredDocument = { publicId: string; resourceType: ResourceType; format: string | null };

/** Upload a private document. */
export async function storeDocument(file: Express.Multer.File): Promise<StoredDocument> {
  const ext = extOf(originalName(file));
  const resourceType: ResourceType = DOC_IMAGE_EXTS.includes(ext) ? 'image' : 'raw';
  const id = randomUUID();
  const res = await uploadBuffer(file.buffer, {
    resource_type: resourceType,
    type: 'authenticated',
    // Raw files keep their extension in the public_id; images get it as "format".
    public_id: resourceType === 'raw' ? `${DOC_FOLDER}/${id}.${ext}` : `${DOC_FOLDER}/${id}`,
    asset_folder: DOC_FOLDER,
    overwrite: false,
  });
  return { publicId: res.public_id, resourceType, format: res.format || null };
}

export type StoredImage = { publicId: string; url: string };

/** Upload a public image (item / lost & found photo, or a profile picture). */
export async function storeImage(file: Express.Multer.File, kind: 'photo' | 'avatar' = 'photo'): Promise<StoredImage> {
  const folder = kind === 'avatar' ? AVATAR_FOLDER : IMAGE_FOLDER;
  const res = await uploadBuffer(file.buffer, {
    resource_type: 'image',
    type: 'upload',
    public_id: `${folder}/${randomUUID()}`,
    asset_folder: folder,
    overwrite: false,
    // Profile pictures: square, small.
    ...(kind === 'avatar' ? { transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }] } : {}),
  });
  return { publicId: res.public_id, url: res.secure_url };
}

/** Signed link to a private document, valid 1 hour. `download` = save as a file instead of opening it. */
export function signedDocumentUrl(publicId: string, resourceType: ResourceType, format: string | null, download = false): string {
  return cloudinary.utils.private_download_url(publicId, format ?? '', {
    resource_type: resourceType,
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_LINK_SECONDS,
    attachment: download,
  });
}

/**
 * public_id of one of OUR public images from its https URL, e.g.
 * https://res.cloudinary.com/<cloud>/image/upload/v123/unilink/images/<uuid>.jpg → unilink/images/<uuid>.
 * Anything else (old Supabase paths, other hosts) → null.
 */
export function imagePublicIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(unilink\/(?:images|avatars)\/[^/.]+)(?:\.[a-z0-9]+)?$/i.exec(url);
  if (!m || m[1] !== config.cloudinary.cloudName) return null;
  return m[2];
}

/** Delete a public image from its stored URL. Never throws. */
export const removeImageUrl = (url: string | null | undefined) => removeStored(imagePublicIdFromUrl(url), 'image', 'upload');

/** Delete a file on Cloudinary. Never throws (a leftover file must not break the request). */
export async function removeStored(publicId: string | null | undefined, resourceType: ResourceType, type: 'authenticated' | 'upload') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type, invalidate: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error(`[cloudinary] could not delete ${publicId}:`, err?.message ?? err);
  }
}

export const removeDocument = (doc: StoredDocument | null | undefined) =>
  doc ? removeStored(doc.publicId, doc.resourceType, 'authenticated') : Promise.resolve();

export const removeImage = (img: StoredImage | null | undefined) =>
  img ? removeStored(img.publicId, 'image', 'upload') : Promise.resolve();
