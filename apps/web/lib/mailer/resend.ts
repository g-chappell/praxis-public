// Resend mailer — production path. Wraps `resend.emails.send`.
//
// Operator follow-ups required before this is reachable in prod:
// (1) create Resend account, verify blacksail.dev,
// (2) add DKIM + SPF records at Dynadot (Resend dashboard shows the exact
//     records),
// (3) put RESEND_API_KEY and RESEND_FROM into /etc/praxis/praxis.env on
//     the VPS.

import { Resend } from 'resend';

import type { Mailer, MailerSendInput, MailerSendResult } from './index';

export class ResendMailer implements Mailer {
  private readonly client: Resend;
  private readonly from: string;

  constructor({ apiKey, from }: { apiKey: string; from: string }) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(input: MailerSendInput): Promise<MailerSendResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (error) {
      throw new Error(`Resend rejected the email: ${error.name}: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error('Resend returned no message ID');
    }

    return { id: data.id };
  }
}
