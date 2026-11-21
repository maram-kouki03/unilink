/**
 * Smoke test of the Documents feature against a running Unilink API.
 *
 *   $env:TEST_EMAIL="..."; $env:TEST_PASSWORD="..."; npm run smoke:docs
 *   (optional) $env:API_URL="http://localhost:4000"
 *   (optional) $env:DRIVE_TEST_URL="https://drive.google.com/file/d/<id>/view"  (a public Drive file)
 *
 * The account should be an admin (or a moderator of the first level) so the moderation steps run.
 * Browses, uploads a unique test PDF, checks the duplicate refusal, approves it (or hides + restores it
 * when it was published right away), stars it, votes "useful", reports, opens, downloads, uploads a
 * new version, then deletes everything it created. Prints a ✅/❌ table. Credentials are never printed.
 */

const API_URL = (process.env.API_URL?.trim() || 'https://unilink-l5l4.onrender.com').replace(/\/+$/, '');
const EMAIL = process.env.TEST_EMAIL?.trim() ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';
const DRIVE_TEST_URL = process.env.DRIVE_TEST_URL?.trim() ?? '';

type Row = { step: string; ok: boolean; status: number | string; ms: number; note: string };
const rows: Row[] = [];
let token = '';

type CallOpts = { method?: string; body?: unknown; form?: FormData; expect?: number[]; timeoutMs?: number; auth?: boolean; redirect?: RequestRedirect };

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
      redirect: opts.redirect ?? 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    const text = isJson ? await res.text() : '';
    if (!isJson) await res.arrayBuffer().catch(() => undefined);
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    const ok = expect.includes(res.status);
    const note = ok ? summary(data, res) : String(data?.error ?? text ?? '').slice(0, 90);
    rows.push({ step, ok, status: res.status, ms: Date.now() - started, note });
    return ok ? ((data ?? {}) as T) : null;
  } catch (err: any) {
    rows.push({ step, ok: false, status: 'ERR', ms: Date.now() - started, note: String(err?.message ?? err).slice(0, 90) });
    return null;
  }
}

function summary(data: unknown, res: Response): string {
  if (res.status >= 300 && res.status < 400) return 'redirect to signed link';
  if (Array.isArray(data)) return `${data.length} rows`;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.error === 'string') return d.error.slice(0, 90);
    if (typeof d.status === 'string') return `status ${d.status}`;
    return Object.keys(d)
      .filter((k) => k !== 'token' && k !== 'url')
      .slice(0, 5)
      .join(', ');
  }
  return res.headers.get('content-type') ?? '';
}

const note = (step: string, ok: boolean, text: string) => rows.push({ step, ok, status: '-', ms: 0, note: text });

/** Small valid PDF with a unique line (so every run is a new file, not a duplicate). */
function uniquePdf(tag: string): Blob {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
% unilink smoke test ${tag}
trailer<</Root 1 0 R>>
%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

function currentYear() {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

function uploadForm(subjectId: string, pdf: Blob, name: string) {
  const form = new FormData();
  form.append('file', pdf, name);
  form.append('subject_id', subjectId);
  form.append('type', 'td');
  form.append('number', '99');
  form.append('academic_year', currentYear());
  return form;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set TEST_EMAIL and TEST_PASSWORD (an existing verified account) before running the smoke test.');
    process.exit(2);
  }
  console.log(`Documents smoke test against ${API_URL} (the first call can take ~60 s if the Render service is asleep)\n`);

  await call('GET /health', '/health', { auth: false, timeoutMs: 120_000 });

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
  const staff = me.role === 'admin' || me.role === 'moderator';

  /* ── browse ── */
  const levels = await call<{ id: number }[]>('GET /levels', '/levels');
  const levelId = levels?.[0]?.id ?? 1;
  await call('GET /levels/:id/periods', `/levels/${levelId}/periods`);
  await call('GET /levels/:id/tracks', `/levels/${levelId}/tracks`);
  await call('GET /me/class', '/me/class');
  const tree = await call<{ id: number; periods: { id: string; subjects: { id: string }[] }[] }[]>('GET /folder-tree', '/folder-tree');
  const firstPeriod = tree?.flatMap((l) => l.periods).find((p) => p.subjects.length);
  const subjectId = firstPeriod?.subjects[0]?.id;
  if (firstPeriod) await call('GET /periods/:id/subjects', `/periods/${firstPeriod.id}/subjects`);
  if (!subjectId) {
    note('pick a subject', false, 'no subject in the database');
    print();
    process.exit(1);
  }
  await call('GET /subjects/:id', `/subjects/${subjectId}`);
  await call('GET /subjects/:id/documents?sort=useful', `/subjects/${subjectId}/documents?sort=useful`);
  await call('GET /subjects/:id/documents?type=exam&sort=recent', `/subjects/${subjectId}/documents?type=exam&sort=recent`);
  const search = await call<{ id: string; mine: boolean }[]>('GET /documents/search?q=td', '/documents/search?q=td');
  await call('GET /documents/recent', '/documents/recent');
  await call('GET /documents/starred', '/documents/starred');
  await call('GET /me/contributions', '/me/contributions');
  await call('GET /contributors/top', '/contributors/top');
  await call('GET /subjects/:id/documents?type=bad (400)', `/subjects/${subjectId}/documents?type=bad`, { expect: [400] });

  /* ── contribute ── */
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pdf = uniquePdf(tag);
  const doc = await call<{ id: string; status: string; title: string }>('POST /documents (upload PDF)', '/documents', {
    form: uploadForm(subjectId, pdf, `smoke-${tag}.pdf`),
    timeoutMs: 120_000,
  });
  const created: string[] = [];
  if (doc?.id) created.push(doc.id);

  if (doc?.id) {
    await call('POST /documents (same file → 409)', '/documents', {
      form: uploadForm(subjectId, uniquePdf(tag), `again-${tag}.pdf`),
      expect: [409],
      timeoutMs: 60_000,
    });
    await call('POST /documents (no file → 400)', '/documents', { form: new FormData(), expect: [400] });

    /* ── moderation ── */
    if (staff) {
      await call('GET /mod/queue', '/mod/queue');
      await call('GET /mod/stats', '/mod/stats');
      await call('GET /mod/users?q=a', '/mod/users?q=a');
      if (doc.status === 'pending') {
        await call('POST /mod/documents/:id/approve', `/mod/documents/${doc.id}/approve`, { body: { number: 98 } });
      } else {
        note('upload auto-approved', true, `status ${doc.status} (trusted/moderator/admin)`);
        await call('POST /mod/documents/:id/hide', `/mod/documents/${doc.id}/hide`, { body: { note: 'smoke test' } });
        await call('POST /mod/documents/:id/restore', `/mod/documents/${doc.id}/restore`, { body: {} });
      }
    } else {
      note('moderation steps', doc.status === 'pending', `skipped: the account is a ${me.role} (status ${doc.status})`);
      await call('GET /mod/queue (student → 403)', '/mod/queue', { expect: [403] });
    }

    const detail = await call<{ status: string }>('GET /documents/:id', `/documents/${doc.id}`);
    const approved = detail?.status === 'approved';

    /* ── star / useful / report ── */
    if (approved) {
      await call('POST /documents/:id/star (on)', `/documents/${doc.id}/star`, { body: {} });
      await call('POST /documents/:id/star (off)', `/documents/${doc.id}/star`, { body: {} });
    }
    await call('POST /documents/:id/useful (own → 400)', `/documents/${doc.id}/useful`, { body: {}, expect: [400] });
    await call('POST /documents/:id/report (own → 400)', `/documents/${doc.id}/report`, { body: { reason: 'unreadable' }, expect: [400] });
    await call('POST /documents/:id/report (bad reason → 400)', `/documents/${doc.id}/report`, { body: { reason: 'nope' }, expect: [400] });

    // Useful vote + report on someone else's document, undone right after.
    const other = search?.find((d) => !d.mine);
    if (other) {
      const v1 = await call<{ voted: boolean }>('POST /documents/:id/useful (vote)', `/documents/${other.id}/useful`, { body: {} });
      if (v1) await call('POST /documents/:id/useful (undo)', `/documents/${other.id}/useful`, { body: {} });
      if (staff) {
        const rep = await call<{ id: string | null; alreadyReported: boolean }>('POST /documents/:id/report', `/documents/${other.id}/report`, {
          body: { reason: 'other', comment: 'smoke test – dismissed automatically' },
        });
        if (rep?.id) {
          await call('GET /mod/reports', '/mod/reports');
          await call('POST /mod/reports/:id/resolve (dismiss)', `/mod/reports/${rep.id}/resolve`, { body: { action: 'dismiss' } });
        } else if (rep) note('report', true, 'already reported by this account (nothing to undo)');
      } else {
        note('report someone else', true, 'skipped for students (it could not be undone)');
      }
    } else {
      note('useful vote / report on another document', true, 'skipped: no other published document found');
    }

    /* ── open / download ── */
    await call('POST /documents/:id/open', `/documents/${doc.id}/open`, { body: {} });
    await call('GET /documents/:id/link', `/documents/${doc.id}/link`);
    await call('GET /documents/:id/download', `/documents/${doc.id}/download`, { expect: [302], redirect: 'manual' });

    /* ── new version ── */
    const form = new FormData();
    form.append('file', uniquePdf(`${tag}-v2`), `smoke-${tag}-v2.pdf`);
    const v2 = await call<{ id: string; version?: number }>('POST /documents/:id/new-version', `/documents/${doc.id}/new-version`, {
      form,
      timeoutMs: 120_000,
    });
    if (v2?.id) created.push(v2.id);
  }

  /* ── Drive (optional) ── */
  if (DRIVE_TEST_URL) {
    const drive = await call<{ id: string }>('POST /documents/drive-file', '/documents/drive-file', {
      body: { url: DRIVE_TEST_URL, subject_id: subjectId, type: 'other' },
      expect: [201, 409],
    });
    if (drive?.id) created.push(drive.id);
  } else {
    note('POST /documents/drive-file', true, 'skipped (set DRIVE_TEST_URL to a public Drive file)');
  }
  await call('POST /documents/drive-folder (bad link → 400)', '/documents/drive-folder', {
    body: { url: 'https://example.com/folder', subject_id: subjectId, type: 'other' },
    expect: [400, 503],
  });

  /* ── cleanup ── */
  for (const id of created.reverse()) {
    await call('DELETE /documents/:id', `/documents/${id}`, { method: 'DELETE' });
  }
  if (created.length) await call('GET /documents/:id after delete (404)', `/documents/${created[created.length - 1]}`, { expect: [404] });

  print();
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
}

function print() {
  const w = Math.max(...rows.map((r) => r.step.length), 10);
  console.log(`${''.padEnd(3)}${'Step'.padEnd(w)}  ${'HTTP'.padEnd(5)} ${'ms'.padStart(6)}  Note`);
  for (const r of rows) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.step.padEnd(w)}  ${String(r.status).padEnd(5)} ${String(r.ms).padStart(6)}  ${r.note}`);
  }
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failed}/${rows.length} passed${failed ? `, ${failed} failed` : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
