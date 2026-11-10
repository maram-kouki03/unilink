# Unilink · Connect • Share • Belong

This is The SUP'COM student app: a Drive-style document library, carpooling, rents & borrow, lost & found, campus map, events, discussions and direct messages, all behind a `@supcom.tn` login.

**Stack:** Expo (React Native, SDK 54) + Expo Router + TypeScript · TanStack Query · Supabase (Postgres, Auth, Storage, Realtime) · react-native-svg for the illustrations from the design board.

---

## 1. Set up Supabase (≈10 min)

1. Create a project at <https://supabase.com> (region: Europe, e.g. Frankfurt).
2. **Run the database scripts.** Open *SQL Editor* and run these files **in this order**:
   1. `supabase/migrations/20261109000001_schema.sql`
   2. `supabase/migrations/20261109000002_functions_views.sql`
   3. `supabase/migrations/20261109000003_rls_storage.sql`
   4. `supabase/seed.sql`: creates the levels, periods (P1–P4…), example subjects and 4 events.
   
   *Or with the CLI:* `npx supabase link --project-ref <ref>` then `npx supabase db push` and run `seed.sql` once.
3. **Auth settings** (*Authentication → URL Configuration*):
   - Site URL: `unilink://`
   - Redirect URLs: `unilink://**`, `exp://**`
4. **E-mail confirmation**: keep it ON. Students must click the link sent to their `@supcom.tn` inbox.
5. **(Optional) Google sign-in:** *Authentication → Providers → Google* and paste a Google Cloud OAuth client.
   The app asks Google for `hd=supcom.tn`, and the database refuses every e-mail that does not end with `@supcom.tn` (trigger `enforce_supcom_domain`).
6. **Make yourself admin** (admins can publish events and moderate). After you sign up once, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'prenom.nom@supcom.tn';
   ```

## 2. Run the app

```bash
cp .env.example .env          # paste your Project URL + anon key (Project Settings → API)
npm install
npx expo install --fix         # aligns every Expo package with the installed SDK
npx expo start                 # scan the QR code with Expo Go
```

Everything works in **Expo Go** (maps, file picker, WebView PDF preview, image picker).
For store builds use EAS: `npx eas build -p android` (add a Google Maps API key under `android.config.googleMaps.apiKey` in `app.json` for the ride map on Android release builds).

`npm run typecheck` runs TypeScript. Once the Supabase project is linked, `npm run db:types` generates exact database types.

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
  map                             isometric campus map + Directions
  events/ index · [id]            register, add to Google Calendar
  discussions/ [id] · new         threads with realtime replies, best answer
  chat/ index · [id]              direct messages (Contact owner / driver)
  notifications · profile/edit · profile/saved · profile/activity
src/
  theme.ts                        colours, radii, shadows, fonts from the design
  components/ui                   Button, Field, Chip, SegmentedTabs, Header, Screen…
  components/cards.tsx            FolderCard, FileRow, RideCard, ItemCard, EventCard, PostCard
  components/Illustrations.tsx    logo, campus building, items, events (SVG)
  components/CampusMapArt.tsx     tappable isometric map, edit data/campus.ts
  api/                            all Supabase queries & mutations (TanStack Query hooks)
  providers/AuthProvider.tsx      session, profile, @supcom.tn check, Google OAuth
supabase/
  migrations/                     tables, views, RPCs, triggers, RLS, storage buckets
  seed.sql                        folder tree + sample events
```

### Backend at a glance

| Feature | Tables / functions |
|---|---|
| Documents (Drive-style) | `levels → periods → subjects → documents`, views `level_stats`, `period_stats`, `subject_stats`, `document_stars`, `document_opens`, `document_reports`, RPC `increment_download`, bucket **documents** (private, 50 MB) |
| Rides | `rides`, `ride_bookings`, `ride_reviews`, view `rides_feed` (seats left, rating), RPCs `book_ride` (locks the row, so no overbooking) and `cancel_booking` |
| Rents & Borrow / Lost & Found | `items`, `lost_found`, bucket **images** (public, 5 MB) |
| Events | `events`, `event_registrations`, view `events_feed` |
| Discussions | `posts`, `comments`, `post_likes`, view `posts_feed`, RPC `mark_best_answer` |
| Messages | `conversations`, `messages`, view `my_conversations`, RPC `start_conversation` |
| Notifications | `notifications`, created automatically by triggers on replies, bookings and messages |

Security: Row Level Security is on for every table. Any signed-in SUP'COM student can read; you can only change your own rows; you can never change your own `role`; uploads go into a storage folder named after your user id.

---

## 4. Next steps

- **Push notifications:** add `expo-notifications`, store the Expo push token on `profiles`, and send pushes from a Supabase Edge Function triggered on `notifications` inserts.
- **Storage beyond 1 GB:** the free tier holds ~1 GB. When the library grows, move the `documents` bucket to Cloudflare R2 (10 GB free) and keep only metadata in Postgres, or fill `drive_url` and store files in the shared SUP'COM Google Drive.
- **Admin panel:** a small web page (or Supabase Studio) to create subjects, publish events and review `document_reports`.
- **Real subject list:** edit `supabase/seed.sql` (and `src/data/campus.ts` for building names and coordinates) to match the official programme and campus.
