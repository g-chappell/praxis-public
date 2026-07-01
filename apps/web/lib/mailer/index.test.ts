import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DevMailer } from './dev';

const MAIL_DIR = resolve(process.cwd(), '.mail');

describe('DevMailer', () => {
  beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
    await mkdir(MAIL_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  it('writes an HTML file containing the magic-link URL', async () => {
    const mailer = new DevMailer();
    const link = 'http://localhost:3000/api/auth/magic-link/verify?token=abc';
    const html = `<a href="${link}">Sign in</a>`;

    const result = await mailer.send({
      to: 'someone@example.com',
      subject: 'Sign in',
      html,
    });

    expect(result.id).toMatch(/^dev-/);

    // The dev mailer should write exactly one HTML file.
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(MAIL_DIR);
    expect(files).toHaveLength(1);

    const file = files[0]!;
    expect(file).toMatch(/someone@example\.com\.html$/);

    const contents = await readFile(resolve(MAIL_DIR, file), 'utf8');
    expect(contents).toContain(link);
  });

  it('sanitises the recipient in the filename', async () => {
    const mailer = new DevMailer();
    await mailer.send({
      to: 'a/b\\c?@example.com',
      subject: 's',
      html: '<a href="http://x">x</a>',
    });
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(MAIL_DIR);
    expect(files[0]).toMatch(/a_b_c_@example\.com\.html$/);
  });
});
