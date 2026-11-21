import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing environment variable ${name}. Copy backend/.env.example to backend/.env and fill it in (on Render: Environment tab).`);
  }
  return value.trim();
}

for (const name of ['DATABASE_URL', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
  if (/YOUR-|change-me/i.test(process.env[name] ?? '')) {
    throw new Error(`${name} still contains the placeholder from .env.example. Put the real value in backend/.env (or in the Render dashboard).`);
  }
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  // Render sets PORT itself.
  port: Number(process.env.PORT) || 4000,
  allowedDomain: (process.env.ALLOWED_EMAIL_DOMAIN?.trim() || 'supcom.tn').toLowerCase(),
  cloudinary: {
    cloudName: required('CLOUDINARY_CLOUD_NAME'),
    apiKey: required('CLOUDINARY_API_KEY'),
    apiSecret: required('CLOUDINARY_API_SECRET'),
  },
  // Google Drive API v3 key (read-only, public files). Optional: without it, Drive links are refused.
  googleApiKey: process.env.GOOGLE_API_KEY?.trim() || null,
  // Google Apps Script mail relay. Optional in development (codes are then printed in the console).
  mail: {
    relayUrl: process.env.MAIL_RELAY_URL?.trim() || null,
    relaySecret: process.env.MAIL_RELAY_SECRET?.trim() || null,
  },
};

if (process.env.NODE_ENV === 'production' && (!config.mail.relayUrl || !config.mail.relaySecret)) {
  // eslint-disable-next-line no-console
  console.warn('[config] MAIL_RELAY_URL / MAIL_RELAY_SECRET are not set: verification and reset e-mails cannot be sent.');
}

if (config.jwtSecret.length < 32) {
  // eslint-disable-next-line no-console
  console.warn('[config] JWT_SECRET is short. Use at least 32 random characters.');
}
