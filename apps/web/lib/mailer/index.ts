// Mailer interface + factory.
//
// The single call site today is `lib/auth.ts` (magic-link). When STORY-08+
// needs server-side mail from elsewhere, this file is the import point;
// promote to `packages/mailer` if a second consumer ever appears.
//
// Selection: ResendMailer in production OR when RESEND_API_KEY is set;
// DevMailer otherwise. Production with no RESEND_API_KEY throws at factory
// time — see ADR-0005 reasoning ("loud fail, not silent").

import { DevMailer } from './dev';
import { ResendMailer } from './resend';

export interface MailerSendInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailerSendResult {
  /** Provider message ID (Resend's email ID in prod; a synthetic
   *  `dev-<uuid>` in dev). Caller can log this for delivery debugging. */
  id: string;
}

export interface Mailer {
  send(input: MailerSendInput): Promise<MailerSendResult>;
}

/** Lazy singleton — first call constructs the right impl based on env. */
let _mailer: Mailer | undefined;

export function getMailer(): Mailer {
  if (_mailer) return _mailer;

  const hasResend = !!process.env.RESEND_API_KEY;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && !hasResend) {
    throw new Error(
      'Magic-link email cannot be sent in production: RESEND_API_KEY is not set. ' +
        'Add it to /etc/praxis/praxis.env on the VPS.',
    );
  }

  _mailer = hasResend
    ? new ResendMailer({
        apiKey: process.env.RESEND_API_KEY!,
        from: process.env.RESEND_FROM ?? 'noreply@praxis.blacksail.dev',
      })
    : new DevMailer();

  return _mailer;
}

/** Convenience for the magic-link callsite in lib/auth.ts. Renders a
 *  minimal one-link email; same shape from dev or prod. */
export async function sendMagicLinkEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<MailerSendResult> {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign in to Praxis</title></head>
<body style="font-family: sans-serif; padding: 2rem; max-width: 32rem;">
  <h1 style="margin-bottom: 1rem;">Sign in to Praxis</h1>
  <p>Click the link below to sign in. The link expires in 5 minutes.</p>
  <p style="margin: 2rem 0;">
    <a href="${url}" style="background:#0f172a;color:white;padding:0.75rem 1.5rem;border-radius:0.5rem;text-decoration:none;">
      Sign in to Praxis
    </a>
  </p>
  <p style="color: #64748b; font-size: 0.875rem;">
    If you didn't request this, you can safely ignore this email.
  </p>
</body>
</html>`;

  return getMailer().send({
    to,
    subject: 'Sign in to Praxis',
    html,
    text: `Sign in to Praxis: ${url} (expires in 5 minutes)`,
  });
}

// Re-exports for direct use in tests.
export { DevMailer, ResendMailer };
