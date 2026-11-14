import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing environment variable ${name}. Copy backend/.env.example to backend/.env and fill it in.`);
  }
  return value.trim();
}

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR?.trim() || 'uploads');

export const config = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  port: Number(process.env.PORT) || 4000,
  allowedDomain: (process.env.ALLOWED_EMAIL_DOMAIN?.trim() || 'supcom.tn').toLowerCase(),
  uploadDir,
  documentsDir: path.join(uploadDir, 'documents'),
  imagesDir: path.join(uploadDir, 'images'),
};

if (config.jwtSecret.length < 32) {
  // eslint-disable-next-line no-console
  console.warn('[config] JWT_SECRET is short. Use at least 32 random characters.');
}
