/**
 * Smoke test against a running Unilink API.
 *
 *   $env:TEST_EMAIL="..."; $env:TEST_PASSWORD="..."; npm run smoke
 *   (optional) $env:API_URL="http://localhost:4000"
 *
 * Logs in with an existing verified account, calls every GET endpoint,
 * creates then deletes a post, a ride, an item, a lost & found entry and a document,
 * and prints a ✅/❌ table. The credentials are never printed.
 */

const API_URL = (process.env.API_URL?.trim() || 'https://unilink-l5l4.onrender.com').replace(/\/+$/, '');
const EMAIL = process.env.TEST_EMAIL?.trim() ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

type Row = { step: string; ok: boolean; status: number | string; ms: number; note: string };
const rows: Row[] = [];
let token = '';

type CallOpts = { method?: string; body?: unknown; form?: FormData; expect?: number[]; timeoutMs?: number; auth?: boolean };

async function call<T = any>(step: string, path: string, opts: CallOpts = {}): Promise<T | null> {
  const started = Date.now();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const expect = opts.expect ?? [200, 201];
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    const ok = expect.includes(res.status);
    const note = ok ? summary(data) : String(data?.error ?? text).slice(0, 80);
    rows.push({ step, ok, status: res.status, ms: Date.now() - started, note });
    return ok ? (data as T) : null;
  } catch (err: any) {
    rows.push({ step, ok: false, status: 'ERR', ms: Date.now() - started, note: String(err?.message ?? err).slice(0, 80) });
    return null;
  }
}

function summary(data: unknown): string {
  if (Array.isArray(data)) return `${data.length} rows`;
  if (data && typeof data === 'object') {
    const keys = Object.keys(data).filter((k) => k !== 'token' && k !== 'url');
    return keys.slice(0, 5).join(', ');
  }
  return '';
}

/** Smallest valid PDF. */
function tinyPdf(): Blob {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

/** 1×1 PNG. */
function tinyPng(): Blob {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' });
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set TEST_EMAIL and TEST_PASSWORD (an existing verified account) before running the smoke test.');
    process.exit(2);
  }
  console.log(`Smoke test against ${API_URL} (the first call can take ~60 s if the Render service is asleep)\n`);

  /* ── public ── */
  await call('GET /', '/', { auth: false, timeoutMs: 120_000 });
  await call('GET /health', '/health', { auth: false, timeoutMs: 60_000 });

  /* ── login ── */
  const login = await call<{ token: string; profile: { id: string; role: string } }>('POST /auth/login', '/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
    auth: false,
  });
  if (!login?.token) {
    print();
    console.error('\nLogin failed: check TEST_EMAIL / TEST_PASSWORD (the account must be verified and not banned).');
    process.exit(1);
  }
  token = login.token;
  const me = login.profile;

  /* ── profile ── */
  await call('GET /me', '/me');
  await call('GET /me/stats', '/me/stats');
  for (const tab of ['posts', 'rides', 'items', 'uploads']) await call(`GET /me/activity?tab=${tab}`, `/me/activity?tab=${tab}`);
  await call('PATCH /me (no change)', '/me', { method: 'PATCH', body: {} });

  /* ── documents tree ── */
  const levels = await call<{ id: number }[]>('GET /levels', '/levels');
  const levelId = levels?.[0]?.id ?? 1;
  await call('GET /levels/:id', `/levels/${levelId}`);
  const periods = await call<{ id: string }[]>('GET /levels/:id/periods', `/levels/${levelId}/periods`);
  const periodId = periods?.[0]?.id;
  let subjectId: string | undefined;
  if (periodId) {
    await call('GET /periods/:id', `/periods/${periodId}`);
    const subjects = await call<{ id: string }[]>('GET /periods/:id/subjects', `/periods/${periodId}/subjects`);
    subjectId = subjects?.[0]?.id;
  }
  const tree = await call<{ periods: { subjects: { id: string }[] }[] }[]>('GET /folder-tree', '/folder-tree');
  subjectId ??= tree?.flatMap((l) => l.periods.flatMap((p) => p.subjects))[0]?.id;
  if (subjectId) {
    await call('GET /subjects/:id', `/subjects/${subjectId}`);
    await call('GET /subjects/:id/documents', `/subjects/${subjectId}/documents?type=all`);
  }
  await call('GET /documents/search', '/documents/search?q=math');
  await call('GET /documents/recent', '/documents/recent');
  await call('GET /documents/starred', '/documents/starred');
  await call('GET /documents/mine', '/documents/mine');

  /* ── lists ── */
  await call('GET /rides (between_cities)', '/rides?scope=between_cities');
  await call('GET /rides (within_city, q)', '/rides?scope=within_city&q=ariana');
  await call('GET /rides/mine', '/rides/mine');
  await call('GET /items (rent)', '/items?mode=rent');
  await call('GET /items (borrow, q)', '/items?mode=borrow&q=book');
  await call('GET /items/mine', '/items/mine');
  await call('GET /lost-found (lost)', '/lost-found?kind=lost');
  await call('GET /lost-found (found)', '/lost-found?kind=found');
  await call('GET /lost-found/returned-count', '/lost-found/returned-count');
  const events = await call<{ id: string }[]>('GET /events', '/events?category=all&upcoming=false');
  await call('GET /events (upcoming)', '/events?upcoming=true');
  if (events?.[0]) await call('GET /events/:id', `/events/${events[0].id}`);
  await call('GET /posts (general)', '/posts?scope=general');
  await call('GET /posts (level)', '/posts?scope=level&level=1A');
  await call('GET /conversations', '/conversations');
  await call('GET /conversations/unread-count', '/conversations/unread-count');
  await call('GET /notifications', '/notifications?limit=20');
  await call('GET /notifications/unread-count', '/notifications/unread-count');
  await call('GET /admin/reports', '/admin/reports?status=open', { expect: me.role === 'admin' ? [200] : [403] });

  /* ── post: create → comment → like → read → delete ── */
  const post = await call<{ id: string }>('POST /posts', '/posts', {
    body: { scope: 'general', level_code: null, topic: 'Smoke test', body: 'Automatic smoke test post, deleted right away.' },
  });
  if (post) {
    await call('GET /posts/:id', `/posts/${post.id}`);
    const comment = await call<{ id: string }>('POST /posts/:id/comments', `/posts/${post.id}/comments`, { body: { body: 'Smoke reply' } });
    await call('GET /posts/:id/comments', `/posts/${post.id}/comments`);
    await call('POST /posts/:id/like', `/posts/${post.id}/like`, { method: 'POST' });
    if (comment) {
      await call('POST /comments/:id/best', `/comments/${comment.id}/best`, { method: 'POST' });
      await call('DELETE /comments/:id', `/comments/${comment.id}`, { method: 'DELETE' });
    }
    await call('DELETE /posts/:id', `/posts/${post.id}`, { method: 'DELETE' });
    await call('GET /posts/:id (gone → 404)', `/posts/${post.id}`, { expect: [404] });
  }

  /* ── ride: create → read → delete ── */
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const ride = await call<{ id: string }>('POST /rides', '/rides', {
    body: { scope: 'within_city', from_place: 'Smoke test', departure_at: tomorrow, seats_total: 3, price_tnd: 0, recurring: false },
  });
  if (ride) {
    await call('GET /rides/:id', `/rides/${ride.id}`);
    await call('POST /rides/:id/book (own → 400)', `/rides/${ride.id}/book`, { body: { seats: 1 }, expect: [400] });
    await call('DELETE /rides/:id', `/rides/${ride.id}`, { method: 'DELETE' });
  }

  /* ── item (with photo → Cloudinary): create → read → availability → delete ── */
  const itemForm = new FormData();
  itemForm.append('mode', 'borrow');
  itemForm.append('title', 'Smoke test item');
  itemForm.append('category', 'Other');
  itemForm.append('photo', tinyPng(), 'photo.png');
  const item = await call<{ id: string }>('POST /items (photo)', '/items', { form: itemForm, timeoutMs: 60_000 });
  if (item) {
    await call('GET /items/:id', `/items/${item.id}`);
    await call('PATCH /items/:id/availability', `/items/${item.id}/availability`, { method: 'PATCH', body: { available: false } });
    await call('DELETE /items/:id', `/items/${item.id}`, { method: 'DELETE' });
  }

  /* ── lost & found: create → read → returned → delete ── */
  const lfForm = new FormData();
  lfForm.append('kind', 'found');
  lfForm.append('title', 'Smoke test entry');
  lfForm.append('location', 'Smoke test');
  const lf = await call<{ id: string }>('POST /lost-found', '/lost-found', { form: lfForm });
  if (lf) {
    await call('GET /lost-found/:id', `/lost-found/${lf.id}`);
    await call('POST /lost-found/:id/returned', `/lost-found/${lf.id}/returned`, { method: 'POST' });
    await call('DELETE /lost-found/:id', `/lost-found/${lf.id}`, { method: 'DELETE' });
  }

  /* ── document (PDF → Cloudinary): upload → read → star → open → link → delete ── */
  if (subjectId) {
    const docForm = new FormData();
    docForm.append('file', tinyPdf(), 'smoke-test.pdf');
    docForm.append('subjectId', subjectId);
    docForm.append('title', 'Smoke test document');
    docForm.append('docType', 'summary');
    const doc = await call<{ id: string }>('POST /documents (pdf)', '/documents', { form: docForm, timeoutMs: 120_000 });
    if (doc) {
      await call('GET /documents/:id', `/documents/${doc.id}`);
      await call('POST /documents/:id/star', `/documents/${doc.id}/star`, { method: 'POST' });
      await call('POST /documents/:id/open', `/documents/${doc.id}/open`, { method: 'POST' });
      await call('POST /documents/:id/download', `/documents/${doc.id}/download`, { method: 'POST' });
      await call('GET /documents/:id/link', `/documents/${doc.id}/link`);
      await call('GET /documents/:id/link?download=1', `/documents/${doc.id}/link?download=1`);
      await call('DELETE /documents/:id', `/documents/${doc.id}`, { method: 'DELETE' });
    }
  } else {
    rows.push({ step: 'POST /documents (pdf)', ok: false, status: '-', ms: 0, note: 'no subject found in /folder-tree' });
  }

  /* ── push token: register → remove ── */
  const fakeToken = `ExponentPushToken[smoke-${Date.now()}]`;
  await call('POST /me/push-token', '/me/push-token', { body: { token: fakeToken, platform: 'android' } });
  await call('DELETE /me/push-token', '/me/push-token', { method: 'DELETE', body: { token: fakeToken } });

  /* ── errors ── */
  await call('GET /me without token → 401', '/me', { auth: false, expect: [401] });
  await call('GET /nope → 404', '/does-not-exist', { expect: [404] });

  print();
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failed}/${rows.length} passed${failed ? `, ${failed} failed` : ''}`);
  process.exit(failed ? 1 : 0);
}

function print() {
  const w = Math.max(...rows.map((r) => r.step.length), 4);
  console.log(`   ${'Step'.padEnd(w)}  Code   Time   Note`);
  for (const r of rows) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.step.padEnd(w)}  ${String(r.status).padEnd(5)} ${`${r.ms}ms`.padStart(6)}  ${r.note}`);
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err?.message ?? err);
  process.exit(1);
});
