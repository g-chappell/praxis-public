// Dev mailer — writes each email to `.mail/<timestamp>-<recipient>.html`
// and logs the verification URL (parsed from the HTML body) to stdout.
//
// `.mail/` is gitignored. Read it locally OR have the e2e suite poll it
// to retrieve the magic-link URL programmatically.

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Mailer, MailerSendInput, MailerSendResult } from './index';

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+)"/;

export class DevMailer implements Mailer {
  async send(input: MailerSendInput): Promise<MailerSendResult> {
    const safeRecipient = input.to.replace(/[^a-z0-9@._-]/gi, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${stamp}-${safeRecipient}.html`;
    const filepath = resolve(MAIL_DIR, filename);

    await mkdir(MAIL_DIR, { recursive: true });
    await writeFile(filepath, input.html, 'utf8');

    process.stdout.write(`[dev-mailer] wrote ${filepath}\n`);
    const match = input.html.match(HREF_RE);
    if (match) {
      process.stdout.write(`[dev-mailer] link: ${match[1]}\n`);
    }

    return { id: `dev-${crypto.randomUUID()}` };
  }
}
