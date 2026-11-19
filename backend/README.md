# Unilink backend

Node.js + Express 5 + TypeScript API for the Unilink app. Supabase is used **only as the PostgreSQL database**.

- Database: raw SQL with [`pg`](https://node-postgres.com/) — every query lives in `src/sql/*.ts` (one file per feature) and is parameterized (`$1, $2…`).
- Auth: own `public.users` table, bcrypt passwords (`bcryptjs`), JWT Bearer tokens valid 30 days. Only `@supcom.tn` e-mails can sign up.
- Files: stored on **Cloudinary**. Multer keeps the upload in memory, then sends it with `upload_stream`.
  - Documents: private (`type: authenticated`) in `unilink/documents`, 50 MB max, pdf/doc/docx/ppt/pptx/xls/xlsx/png/jpg. PDF and Office files are stored as `raw`, PNG/JPG as `image`. `documents.file_path` holds the Cloudinary public_id, with `storage_resource_type` and `storage_format`. `GET /documents/:id/link` returns `{ url }`, a signed Cloudinary link that expires after 1 hour.
  - Images (items, lost & found): public in `unilink/images`, 5 MB max, jpg/png/webp. `photo_path` holds the full https URL.
  - The Cloudinary **free** plan refuses files over 10 MB (the API then answers 413 "File is too large").
- Live updates: Socket.io with the same JWT (`auth: { token }`). Rooms: `user:<id>` (notifications, joined automatically), `post:<id>` (new replies), `conv:<id>` (chat, members only). Events: `notification:new`, `comment:new`, `comment:updated`, `message:new`.
- Validation: zod. Errors are always `{ "error": "message" }` with a proper status code (400, 401, 403, 404, 409, 413, 500).

## Setup

```powershell
copy .env.example .env
npm install
npm run dev
```

`.env`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase dashboard → **Connect** → *Session pooler* URI (works on IPv4 networks): `postgresql://postgres.<project-ref>:<DB password>@aws-0-<region>.pooler.supabase.com:5432/postgres`. If the password contains special characters (`@ # / ? %…`), URL-encode them. |
| `JWT_SECRET` | A long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Changing it logs everybody out. |
| `PORT` | `4000` |
| `ALLOWED_EMAIL_DOMAIN` | `supcom.tn` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary dashboard → **Settings → API Keys** |
| `MAIL_RELAY_URL` | Google Apps Script web app URL (see *E-mails* below). Leave empty in development: codes are printed in the terminal. |
| `MAIL_RELAY_SECRET` | Long random string, same value as the `SECRET` script property in Apps Script |

SSL is turned on automatically for any non-localhost database. The pool is small (5 connections, 15 s connect timeout).

Before the first start, the database must have the migrations `supabase/migrations/20261114000001_own_backend.sql` and `supabase/migrations/20261118000001_cloudinary_storage.sql` applied (Supabase → SQL Editor; both are safe to run twice).

## Account security

- Sign-up writes **nothing** to `users`: the data (bcrypt hash, name, level) waits in `pending_signups` with a 6-digit code. `POST /auth/verify-email` creates the `users` + `profiles` rows in one transaction and deletes the pending row. A new sign-up with the same e-mail replaces the pending one; pending rows older than 24 h are deleted.
- Codes: `crypto.randomInt`, stored as HMAC-SHA256 (key `JWT_SECRET`), valid 15 minutes, 5 wrong attempts max, only the latest code works. Max 1 new code per 60 s and 10 per hour per e-mail. Sign-up codes live in `pending_signups`, reset codes in `email_codes`.
- Password reset: the code is traded for a `resetToken` (JWT, `{ sub, purpose: "reset" }`, 10 min, single-use: it stops working once the password changes).
- Password rule (server and app): 8+ characters, uppercase, lowercase, number, special character.

| Endpoint | Body | Answer |
|---|---|---|
| `POST /auth/signup` | `fullName, email, password, level` | `201 { needsVerification: true, email, codeSent }`, `409` if the account exists |
| `POST /auth/verify-email` | `email, code` | `{ token, profile }` |
| `POST /auth/resend-code` | `email, purpose: "verify" \| "reset"` | `{ ok, message }` (429 `{ error, retryAfter }` if too soon) |
| `POST /auth/login` | `email, password` | `{ token, profile }` |
| `POST /auth/forgot-password` | `email` | always `200 { ok, message }` |
| `POST /auth/verify-reset-code` | `email, code` | `{ resetToken }` |
| `POST /auth/reset-password` | `resetToken, password` | `{ token, profile }` |

Migrations: `20261119000001_account_security.sql`, then `20261119000002_pending_signups.sql`.

## E-mails (Google Apps Script relay)

The backend POSTs `{ secret, to, subject, html }` to `MAIL_RELAY_URL` and expects `{ ok: true }` or `{ ok: false, error }`. Mails are sent from the Google account that owns the script (a free Gmail account can send about 100 e-mails per day).

1. Go to [script.google.com](https://script.google.com) → **New project**, paste:

   ```js
   function doPost(e) {
     var out = { ok: false };
     try {
       var body = JSON.parse(e.postData.contents);
       var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
       if (!secret || body.secret !== secret) {
         out.error = 'unauthorized';
       } else if (!body.to || !body.subject || !body.html) {
         out.error = 'missing to, subject or html';
       } else {
         MailApp.sendEmail({ to: body.to, subject: body.subject, htmlBody: body.html, name: 'Unilink' });
         out = { ok: true };
       }
     } catch (err) {
       out.error = String(err);
     }
     return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
   }
   ```

2. **Project Settings → Script properties → Add**: `SECRET` = a long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
3. **Deploy → New deployment → Web app**: *Execute as*: **Me**, *Who has access*: **Anyone**. Authorize, then copy the URL ending in `/exec` → `MAIL_RELAY_URL`. Put the same secret in `MAIL_RELAY_SECRET`.
4. After editing the script, use **Deploy → Manage deployments → Edit → New version** (the URL stays the same).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with auto-reload (`tsx watch`) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | TypeScript check only |

## Layout

```
src/
  index.ts        express app, trust proxy, CORS, JSON, GET /health, Socket.io, listen 0.0.0.0:$PORT
  config.ts       environment variables
  db.ts           pg Pool (int8/numeric → numbers), query / one / transaction helpers
  http.ts         HttpError, zod parse helper, error middleware
  auth.ts         signToken, requireAuth, requireAdmin
  files.ts        multer (memory) + Cloudinary upload / signed link / delete
  realtime.ts     Socket.io server and rooms
  notify.ts       insert a notification + emit notification:new
  sql/            SQL, one file per feature
  routes/         endpoints, one file per feature
```

## Existing accounts

The migration copies every Supabase Auth account into `public.users` with its bcrypt hash, so students keep their passwords. Accounts that only used Google sign-in have no password (`password_hash = '!'`) and cannot log in. To give one a password:

```powershell
node -e "console.log(require('bcryptjs').hashSync('NewPassword123', 10))"
```

then in the Supabase SQL editor: `update public.users set password_hash = '<the hash>' where email = 'prenom.nom@supcom.tn';`

Files uploaded before Cloudinary (in Supabase Storage or in the old `uploads/` folder) are not moved: those documents answer "File not found on the server. Please upload it again." and their photos don't show. Re-upload them.

## Deploy on Render

The repo root contains `render.yaml` (a Render *Blueprint*) for a **free** Node web service.

1. In Supabase → **SQL Editor**, run `supabase/migrations/20261118000001_cloudinary_storage.sql`.
2. Create a free account on [cloudinary.com](https://cloudinary.com) and copy *Cloud name*, *API Key* and *API Secret* (Settings → API Keys).
3. On [render.com](https://render.com): **New → Blueprint**, then choose the GitHub repo. Render reads `render.yaml`: root directory `backend`, build `npm install --include=dev && npm run build`, start `npm start`, health check `/health`.
4. Render asks for the secret variables (`sync: false`, so they are never stored in Git):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase *Session pooler* URI (same as your local `.env`) |
   | `JWT_SECRET` | Same as locally, or a new long random string (a new one logs everybody out) |
   | `ALLOWED_EMAIL_DOMAIN` | `supcom.tn` |
   | `CLOUDINARY_CLOUD_NAME` | from Cloudinary |
   | `CLOUDINARY_API_KEY` | from Cloudinary |
   | `CLOUDINARY_API_SECRET` | from Cloudinary |
   | `MAIL_RELAY_URL` | Apps Script web app URL (`…/exec`) |
   | `MAIL_RELAY_SECRET` | same value as the `SECRET` script property |

   Do **not** add `PORT`: Render sets it. `NODE_ENV=production` and `NODE_VERSION=22` come from `render.yaml`.
5. When the deploy finishes, open `https://<your-service>.onrender.com/health`. It should show `{"ok":true,"db":"up",...}`.
6. In the app's `.env` (repo root) set `EXPO_PUBLIC_API_URL=https://<your-service>.onrender.com` (no trailing slash), then restart Expo / rebuild the app.

Free plan notes:

- The service **sleeps after 15 minutes without traffic**. The first request after that takes about 30–60 seconds.
- The disk is wiped on every restart. That is why files are on Cloudinary.
- Socket.io works behind Render's proxy (WebSocket, with HTTP long-polling as fallback). `trust proxy` is on, so `req.protocol` is `https`.
- Every push to `main` redeploys automatically.
