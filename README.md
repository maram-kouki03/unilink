# Unilink · Connect • Share • Belong

This is The SUP'COM student app: a Drive-style document library, carpooling, rents & borrow, lost & found, events, discussions and direct messages, all behind a `@supcom.tn` login.

**Stack:** Expo (React Native, SDK 58) + Expo Router + TypeScript · TanStack Query · **own backend** in `backend/` (Node.js + Express 5 + TypeScript, raw SQL with `pg`, JWT auth, Multer file storage, Socket.io live updates) · **Supabase used only as the PostgreSQL database** · react-native-svg for the illustrations from the design board.

```
 Expo app ──HTTP (JSON / multipart) + Socket.io──▶ backend/ (Express) ──SQL──▶ Supabase PostgreSQL
```

The app never talks to Supabase. Supabase's own API is locked: RLS is enabled on every table with no policies, and the `anon` / `authenticated` roles have no privileges.

---

## 1. Set up the database (once)

1. Create a Supabase project (region: Europe, e.g. Frankfurt) — or reuse the existing one.
2. Open *SQL Editor* and run these files **in this order** (skip the ones already deployed):
   1. `supabase/migrations/20261109000001_schema.sql`
   2. `supabase/migrations/20261109000002_functions_views.sql`
   3. `supabase/migrations/20261109000003_rls_storage.sql`
   4. `supabase/seed.sql`: levels, periods (P1–P4…), example subjects and 4 events.
   5. `supabase/migrations/20261114000001_own_backend.sql`: switches to the own backend (own `users` table, copies existing accounts with their passwords, removes Supabase-Auth policies/views/functions). It is safe to run twice.
   6. `supabase/migrations/20261118000001_cloudinary_storage.sql`: columns for files stored on Cloudinary. Safe to run twice.
   7. `supabase/migrations/20261119000001_account_security.sql`: e-mail verification and password-reset codes. Safe to run twice.

   *Or with the CLI:* `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Make yourself admin** (admins can publish events and delete any document). After you sign up once, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'prenom.nom@supcom.tn';
   ```

## 2. Running Unilink

You need **Node.js 20+**, the **Expo Go** app on your Android phone, and the phone and PC on the **same Wi-Fi**.

### a) Start the backend

```powershell
cd backend
copy .env.example .env      # then fill in DATABASE_URL and JWT_SECRET (see backend/README.md)
npm install
npm run dev                 # → "Unilink API listening on http://0.0.0.0:4000"
```

Check it in a browser on the PC: <http://localhost:4000/health> must show `{"ok":true}`.

### b) Find your PC's IPv4 address

```powershell
ipconfig
```

Look under your **Wi-Fi** adapter for `IPv4 Address`, e.g. `192.168.1.20` (ignore `vEthernet`, VirtualBox, Tailscale… adapters).

### c) Allow Node.js in the Windows Firewall

The first time `npm run dev` starts, Windows asks whether Node.js may communicate on networks: tick **Private networks** and click *Allow*.
If you missed the prompt: *Windows Security → Firewall & network protection → Allow an app through firewall → Change settings* → tick **Private** for every "Node.js JavaScript Runtime" entry. Make sure your Wi-Fi network profile is **Private** (*Settings → Network & internet → Wi-Fi → your network*).

Test from the phone: open `http://<PC IPv4>:4000/health` in the phone's browser — it must show `{"ok":true}`.

### d) Point the app to the backend

In the project root:

```powershell
copy .env.example .env
```

and set:

```
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000      # your PC IPv4 from step b
EXPO_PUBLIC_ALLOWED_EMAIL_DOMAIN=supcom.tn
```

### e) Start Expo

In a **second** terminal, at the project root:

```powershell
npm install
npx expo start -c            # -c clears the cache so the new .env is picked up
```

Scan the QR code with Expo Go. If your IP changes (another Wi-Fi), update `EXPO_PUBLIC_API_URL` and restart with `npx expo start -c`.

`npm run typecheck` checks the app; `npm run typecheck` inside `backend/` checks the server.

> **Android PDF preview:** Android shows PDFs through the Google Docs viewer, which can only open public `https` links. With the backend on `http://<PC IP>` (development) the preview screen says *"Preview not available on Android in development — tap Download"*. Download / Save offline / Share work normally. Once the backend is deployed behind https, the preview works again.

---

## 3. What is where

```
app/                              ← screens (Expo Router: one file = one route)
  (auth)/welcome · sign-in · sign-up
  (tabs)/index        Home         greeting, hero, Quick Access, upcoming events
  (tabs)/documents    Documents    levels, search + filters, recently opened, starred
  (tabs)/discussions  Discussions  General / By Level, likes, violet ✎ button
  (tabs)/profile      Profile      stats, menu, log out
  create              the central “+” quick-create sheet
  documents/level/[levelId]       periods (P1–P4, empty-folder state)
  documents/period/[periodId]     subject folders (grid / list)
  documents/subject/[subjectId]   files + ⋮ menu (Drive, offline, share, report)
  documents/file/[id]             preview, uploader, Open in Drive / Download
  documents/upload                level → period → subject → type flow
  rides/ index · [id] · offer · mine
  rents/ index · [id] · new
  lost-found/ index · report
  events/ index · [id]            register, add to Google Calendar
  discussions/ [id] · new         threads with live replies, best answer
  chat/ index · [id]              direct messages (Contact owner / driver)
  notifications · profile/edit · profile/saved · profile/activity
src/
  theme.ts                        colours, radii, shadows, fonts from the design
  components/ui                   Button, Field, Chip, SegmentedTabs, Header, Screen…
  components/cards.tsx            FolderCard, FileRow, RideCard, ItemCard, EventCard, PostCard
  components/Illustrations.tsx    logo, campus building, items, events (SVG)
  api/                            TanStack Query hooks calling the backend
  lib/api.ts                      fetch wrapper (EXPO_PUBLIC_API_URL, JWT in SecureStore, errors, 401 → logout)
  lib/socket.ts                   the single Socket.io connection (rooms, re-join on reconnect)
  lib/storage.ts                  photo URLs, signed document links, download / share / offline
  providers/AuthProvider.tsx      session, profile, @supcom.tn check, Remember me
backend/                          ← own API (see backend/README.md)
  src/routes/*.ts                 HTTP endpoints, one file per feature
  src/sql/*.ts                    every SQL query (parameterized), one file per feature
supabase/
  migrations/                     tables, views, the own-backend switch
  seed.sql                        folder tree + sample events
```

### Backend at a glance

| Feature | Endpoints | Tables |
|---|---|---|
| Auth & profile | `POST /auth/signup` · `/auth/login` · `GET/PATCH /me` · `/me/stats` · `/me/activity` | `users`, `profiles` |
| Documents (Drive-style) | `/levels…` · `/periods…` · `/subjects…` · `/folder-tree` · `/documents…` · signed `GET /files/documents/:id?sig=` | `levels → periods → subjects → documents`, views `level_stats`, `period_stats`, `subject_stats`, `document_stars`, `document_opens`, `document_reports` |
| Rides | `/rides…` (booking in a transaction with `SELECT … FOR UPDATE`, so no overbooking) | `rides`, `ride_bookings`, `ride_reviews` |
| Rents & Borrow / Lost & Found | `/items…` · `/lost-found…` | `items`, `lost_found` |
| Events | `/events…` (creating = admins only) | `events`, `event_registrations` |
| Discussions | `/posts…` · `/comments/:id/best` | `posts`, `comments`, `post_likes` |
| Messages | `/conversations…` | `conversations`, `messages` |
| Notifications | `/notifications` · `/notifications/read-all` (+ live `notification:new`) | `notifications` |

Files are stored by the backend on disk: `backend/uploads/documents` (private, 50 MB, opened through 1-hour signed links) and `backend/uploads/images` (public, 5 MB).

---

## 4. Next steps

- **Deploy the backend** (Render, Railway, a VPS…) behind **https**, and set `EXPO_PUBLIC_API_URL` to that address. Keep `backend/uploads` on a persistent disk.
- **Push notifications:** add `expo-notifications`, store the Expo push token on `profiles`, and send pushes from `backend/src/notify.ts`.
- **Password reset:** today students write to unilink@supcom.tn; add an e-mail reset flow in the backend later.
- **Admin panel:** a small web page to create subjects, publish events and review `document_reports`.
- **Real subject list:** edit `supabase/seed.sql` (and `src/data/places.ts` for campus place names and coordinates) to match the official programme and campus.
