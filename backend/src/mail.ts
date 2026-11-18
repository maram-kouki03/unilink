import { config } from './config';

/**
 * E-mails are sent through a Google Apps Script web app ("mail relay"):
 * POST MAIL_RELAY_URL { secret, to, subject, html } → { ok: true } | { ok: false, error }.
 */

export type CodePurpose = 'verify' | 'reset';

const TEXT: Record<CodePurpose, { subject: string; titleFr: string; bodyFr: string; titleEn: string; bodyEn: string }> = {
  verify: {
    subject: 'Unilink – Confirmez votre e-mail / Confirm your e-mail',
    titleFr: 'Confirmez votre adresse e-mail',
    bodyFr: 'Bienvenue sur Unilink ! Entrez ce code dans l’application pour activer votre compte.',
    titleEn: 'Confirm your e-mail address',
    bodyEn: 'Welcome to Unilink! Enter this code in the app to activate your account.',
  },
  reset: {
    subject: 'Unilink – Réinitialisation du mot de passe / Password reset',
    titleFr: 'Réinitialisez votre mot de passe',
    bodyFr: 'Vous avez demandé à changer votre mot de passe. Entrez ce code dans l’application.',
    titleEn: 'Reset your password',
    bodyEn: 'You asked to change your password. Enter this code in the app.',
  },
};

function codeEmailHtml(code: string, purpose: CodePurpose): string {
  const t = TEXT[purpose];
  const digits = code
    .split('')
    .map(
      (d) =>
        `<td style="width:44px;height:56px;background:#F1F2FB;border:2px solid #7C5CF2;border-radius:12px;text-align:center;font-size:30px;font-weight:800;color:#141A4F;font-family:'Courier New',monospace;">${d}</td>`,
    )
    .join('<td style="width:8px;"></td>');
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F2FB;font-family:Arial,Helvetica,sans-serif;color:#12153D;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F2FB;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:24px;overflow:hidden;">
  <tr><td style="background:#141A4F;background-image:linear-gradient(135deg,#141A4F,#3D3FD9,#7C5CF2);padding:28px 32px;">
    <div style="font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:.5px;">Unilink</div>
    <div style="font-size:13px;color:#B7A6FF;margin-top:4px;">SUP'COM student community</div>
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#141A4F;">${t.titleFr}</h1>
    <p style="margin:0 0 4px;font-size:15px;line-height:1.5;color:#12153D;">${t.bodyFr}</p>
    <p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#6B6F8E;"><strong style="color:#141A4F;">${t.titleEn}</strong> · ${t.bodyEn}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto;"><tr>${digits}</tr></table>
    <p style="margin:0;text-align:center;font-size:14px;color:#7C5CF2;font-weight:700;">Ce code expire dans 15 minutes · This code expires in 15 minutes</p>
    <hr style="border:none;border-top:1px solid #EEEFF8;margin:28px 0 16px;">
    <p style="margin:0;font-size:12px;line-height:1.5;color:#6B6F8E;">Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.<br>If you didn’t ask for this, you can ignore this e-mail.</p>
  </td></tr>
</table>
<p style="font-size:11px;color:#8A8DA8;margin:16px 0 0;">Unilink · SUP'COM</p>
</td></tr></table>
</body></html>`;
}

/** Send a 6-digit code. Throws if the relay refuses or cannot be reached. */
export async function sendCode(to: string, code: string, purpose: CodePurpose): Promise<void> {
  const { relayUrl, relaySecret } = config.mail;
  if (!relayUrl) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[mail] MAIL_RELAY_URL is not set (development): ${purpose} code for ${to} is ${code}`);
      return;
    }
    throw new Error('MAIL_RELAY_URL is not set');
  }
  if (!relaySecret) throw new Error('MAIL_RELAY_SECRET is not set');

  const res = await fetch(relayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: relaySecret, to, subject: TEXT[purpose].subject, html: codeEmailHtml(code, purpose) }),
    // Apps Script answers with a redirect to the real response.
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: { ok?: boolean; error?: string } | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok || !data || data.ok !== true) {
    throw new Error(`Mail relay failed (HTTP ${res.status}): ${data?.error ?? text.slice(0, 200)}`);
  }
}
