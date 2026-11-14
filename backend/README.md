# Unilink backend

Node.js + Express 5 + TypeScript API for the Unilink app. Supabase is used **only as the PostgreSQL database**.

- Database: raw SQL with [`pg`](https://node-postgres.com/) — every query lives in `src/sql/*.ts` (one file per feature) and is parameterized (`$1, $2…`).
- Auth: own `public.users` table, bcrypt passwords (`bcryptjs`), JWT Bearer tokens valid 30 days. Only `@supcom.tn` e-mails can sign up.
- Files: stored on disk by Multer.
  - `uploads/documents` — private, 50 MB max, pdf/doc/docx/ppt/pptx/xls/xlsx/png/jpg. Opened with a signed link valid 1 hour: `GET /files/documents/:id?sig=…` (get it from `GET /documents/:id/link`).
  - `uploads/images` — public, 5 MB max, jpg/png/webp, served at `/uploads/images/<file>`.
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
| `UPLOAD_DIR` | `uploads` (relative to `backend/`) |

SSL is turned on automatically for any non-localhost database.

Before the first start, the database must have the migration `supabase/migrations/20261114000001_own_backend.sql` applied (see the root README).

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
  index.ts        express app, CORS, JSON, static /uploads/images, GET /health, Socket.io, listen 0.0.0.0
  config.ts       environment variables
  db.ts           pg Pool (int8/numeric → numbers), query / one / transaction helpers
  http.ts         HttpError, zod parse helper, error middleware
  auth.ts         signToken, requireAuth, requireAdmin, signFileLink / verifyFileLink
  files.ts        multer configs for documents and images
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

Files uploaded before the switch are still in **Supabase Storage**, not in `uploads/`: those documents open with "File not found on the server" and their photos don't show. Re-upload them (or download them from Supabase Storage into `uploads/documents` / `uploads/images` and update `file_path` / `photo_path`).
