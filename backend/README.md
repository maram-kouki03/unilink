# Unilink backend

Node.js + Express 5 + TypeScript API for the Unilink app. Supabase is used **only as the PostgreSQL database**.

- Database: raw SQL with [`pg`](https://node-postgres.com/) — every query lives in `src/sql/*.ts` (one file per feature) and is parameterized (`$1, $2…`).
- Auth: own `public.users` table, bcrypt passwords (`bcryptjs`), JWT Bearer tokens valid 30 days. Only `@supcom.tn` e-mails can sign up.
- Files: stored on **Cloudinary**. Multer keeps the upload in memory, then sends it with `upload_stream`.
  - Documents: private (`type: authenticated`) in `unilink/documents`, 50 MB max, pdf/doc/docx/ppt/pptx/xls/xlsx/png/jpg. PDF and Office files are stored as `raw`, PNG/JPG as `image`. `documents.file_path` holds the Cloudinary public_id, with `storage_resource_type` and `storage_format`. `GET /documents/:id/link` returns `{ url }`, a signed Cloudinary link that expires after 1 hour.
  - Images (items, lost & found): public in `unilink/images`, 5 MB max, jpg/png/webp. `photo_path` holds the full https URL.
  - The Cloudinary **free** plan refuses files over 10 MB (the API then answers 413 "File is too large").
- Live updates: Socket.io with the same JWT (`auth: { token }`). Rooms: `user:<id>` (notifications, joined automatically), `post:<id>` (new replies), `conv:<id>` (chat, members only). Events: `notification:new`, `comment:new`, `comment:updated`, `message:new`.
- Validation: zod on every body, query string and route parameter. Errors are always `{ "error": "message" }` with a proper status code (400, 401, 403, 404, 409, 413, 429, 500). No stack traces are ever sent; in production only the message is logged.
- Security: `helmet`, CORS, JSON body max 1 MB, rate limits per IP (300 requests / 15 min overall, 20 / 15 min on `/auth/*`), `password_hash` never leaves the server.
- Sessions: the JWT carries `tv` = `users.token_version`. Bumping it (logout-all, change / reset password) signs every device out. Banned users (`users.banned_at`) get `403 "Your account is suspended"` on every request and cannot log in.
- Push: `notify()` stores the notification, emits `notification:new` and sends an Expo push (`https://exp.host/--/api/v2/push/send`, batches of 100, tokens answering `DeviceNotRegistered` are deleted). A push failure never breaks a request.
- Moderation: `POST /reports` on any content. 5+ open reports from different people hide it (`hidden_at`) until an admin decides.

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

Before the first start, the database must have every file of `supabase/migrations/` from `20261114000001_own_backend.sql` onwards applied, in order (Supabase → SQL Editor; each is safe to run twice). The latest is `20261119000003_sessions_moderation_push.sql`.

## Endpoints

All routes except `GET /`, `GET /health` and `/auth/*` (apart from `logout-all`) need `Authorization: Bearer <token>`.
`:id` is always a uuid (anything else → 404). Lists accept `q` (search, max 100 characters) where shown.

| Area | Endpoint | Notes |
|---|---|---|
| Public | `GET /` | `{ name: "Unilink API", status: "running" }` |
| | `GET /health` | `{ ok, db, ms }` (503 if the database is down) |
| Auth | `POST /auth/signup`, `/auth/verify-email`, `/auth/resend-code`, `/auth/login`, `/auth/forgot-password`, `/auth/verify-reset-code`, `/auth/reset-password` | see *Account security* |
| | `POST /auth/logout-all` | signs out every device (this one too) |
| Profile | `GET /me` | profile (`bio`, `avatar_url`, `role`…) |
| | `PATCH /me` | JSON or multipart: `full_name, username, level, period, bio, removeAvatar` + file `avatar` (JPG/PNG/WEBP, 5 MB) |
| | `GET /me/stats` | `{ uploads, rides, posts, items, lost_found, bookings, events, comments }` |
| | `GET /me/activity?tab=posts\|rides\|items\|uploads` | |
| | `POST /me/change-password` | `{ currentPassword, newPassword }` → `{ ok, token }` (other devices signed out) |
| | `DELETE /me` | `{ password }` → deletes the account, all its data and its Cloudinary files |
| | `POST /me/push-token`, `DELETE /me/push-token` | `{ token: "ExponentPushToken[…]", platform: "ios"\|"android"\|"web" }` / `{ token }` |
| Documents | `GET /levels`, `/levels/:id`, `/levels/:id/periods`, `/periods/:id`, `/periods/:id/subjects`, `/subjects/:id`, `/folder-tree` | folder tree with file counts |
| | `GET /subjects/:id/documents?type&q`, `/documents/search?q&type`, `/documents/recent`, `/documents/starred`, `/documents/mine`, `/documents/:id` | |
| | `POST /documents` | multipart: `file` (PDF, Office, PNG, JPG, 50 MB) + `subjectId, title, docType, academicYear?, driveUrl?` |
| | `GET /documents/:id/link?download=1` | `{ url, expiresIn }` signed Cloudinary link (1 h) |
| | `POST /documents/:id/star` (toggle), `/open`, `/download`, `/report { reason }` | |
| | `DELETE /documents/:id` | uploader or admin, also deletes the Cloudinary file |
| Rides | `GET /rides?scope=between_cities\|within_city&q`, `/rides/mine`, `/rides/:id` | |
| | `POST /rides` | `{ scope, from_place, to_place?, departure_at, seats_total, price_tnd, recurring, note?, car?, from_lat?… }` |
| | `POST /rides/:id/book { seats }` | transaction + `SELECT … FOR UPDATE`; no overbooking, not your own ride |
| | `POST /rides/:id/cancel-booking`, `POST /rides/:id/cancel` (driver, notifies passengers), `DELETE /rides/:id` (driver or admin) | |
| Rents & Borrow | `GET /items?mode=rent\|borrow&q`, `/items/mine`, `/items/:id` | |
| | `POST /items` | multipart, optional `photo` (5 MB) |
| | `PATCH /items/:id/availability { available }`, `DELETE /items/:id` | |
| Lost & Found | `GET /lost-found?kind=lost\|found&q`, `/lost-found/returned-count`, `/lost-found/:id` | |
| | `POST /lost-found` (multipart, optional `photo`), `POST /lost-found/:id/returned`, `DELETE /lost-found/:id` | |
| Events | `GET /events?category&upcoming`, `/events/:id` | `going`, `seats`, `seats_left`, `registered_by_me` |
| | `POST /events` (admin, `seats?`), `DELETE /events/:id` (admin) | |
| | `POST /events/:id/register` (toggle, or `{ registered: true\|false }`), `DELETE /events/:id/register` | seat limit checked with the event row locked |
| Discussions | `GET /posts?scope=general\|level&level`, `/posts/:id`, `/posts/:id/comments` | |
| | `POST /posts`, `DELETE /posts/:id`, `POST /posts/:id/like` (toggle) | |
| | `POST /posts/:id/comments { body, parent_id? }`, `POST /comments/:id/best` (post author), `DELETE /comments/:id` | |
| Messages | `GET /conversations` | with `last_message`, `last_sender_id`, `unread_count` |
| | `POST /conversations { otherId, context? }` | one conversation per pair (existing one returned) |
| | `GET /conversations/:id/messages?limit=50&before=<iso>` | oldest first; `before` = `created_at` of the oldest message you have |
| | `POST /conversations/:id/messages { body }`, `POST /conversations/:id/read`, `GET /conversations/unread-count` | |
| Notifications | `GET /notifications?limit&before`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all` | |
| Moderation | `POST /reports { targetType, targetId, reason }` | `targetType`: `document, post, comment, item, lost_found, ride, user` |
| Admin | `GET /admin/reports?status=open\|dismissed\|resolved\|all` | with a preview of the content and its author |
| | `POST /admin/reports/:id/resolve { action: "dismiss"\|"delete_content"\|"ban_user", reason? }` | closes every open report on the same content |
| | `POST /admin/users/:id/ban { reason? }`, `POST /admin/users/:id/unban` | |

Notifications (stored + Socket.io + Expo push) are created for: ride booked, booking cancelled, ride cancelled/deleted, new reply, best answer, new message, event reminder (about 24 h before, checked every 10 minutes while the server is awake).

Socket.io events: `notification:new`, `comment:new`, `comment:updated`, `message:new`, `conversation:updated`, `conversation:read`.

## Smoke test

Runs against the deployed API (or any `API_URL`) with an existing, verified account. It never prints the credentials.

```powershell
cd backend
$env:TEST_EMAIL = "your.name@supcom.tn"
$env:TEST_PASSWORD = "your password"
# optional: $env:API_URL = "http://localhost:4000"   (default https://unilink-l5l4.onrender.com)
npm run smoke
```

It logs in, calls every GET endpoint, creates then deletes a post (+ reply), a ride, an item (with a photo), a lost & found entry and a PDF document, registers then removes a fake push token, and prints a ✅/❌ table. Exit code 1 if anything failed.

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
| `npm run smoke` | Smoke test (see above) |

## Layout

```
src/
  index.ts        express app, trust proxy, CORS, JSON, GET /health, Socket.io, listen 0.0.0.0:$PORT
  config.ts       environment variables
  db.ts           pg Pool (int8/numeric → numbers), query / one / transaction helpers
  http.ts         HttpError, zod parse helper, error middleware
  auth.ts         signToken, verifySession (token_version, bans), requireAuth, requireAdmin
  files.ts        multer (memory) + Cloudinary upload / signed link / delete
  realtime.ts     Socket.io server and rooms
  notify.ts       insert a notification + emit notification:new + Expo push
  push.ts         Expo push sender
  content.ts      delete any content + its Cloudinary file (owners and admins)
  sql/            SQL, one file per feature
  routes/         endpoints, one file per feature
scripts/
  smoke.ts        npm run smoke
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
