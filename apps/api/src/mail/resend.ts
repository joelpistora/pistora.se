import { renderAccountRequest, renderInvite, type Mailer } from "./index.js";

interface MailerLogger {
  error(msg: string, meta?: unknown): void;
}

/**
 * Sends real email via the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email) —
 * a plain `fetch` call, no SDK dependency. Built in `server.ts` from
 * `MAILER=resend` + `RESEND_API_KEY` + `MAIL_FROM`; falls back to
 * `ConsoleMailer` when unset.
 */
export function createResendMailer(opts: {
  apiKey: string;
  from: string;
  log: MailerLogger;
}): Mailer {
  async function send(to: string, subject: string, text: string): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: opts.from, to, subject, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      opts.log.error(`Resend send failed (${res.status} ${res.statusText}): ${body}`);
      throw new Error(`failed to send email via Resend (${res.status})`);
    }
  }

  return {
    async sendInvite(msg) {
      const { subject, body } = renderInvite(msg);
      await send(msg.to, subject, body);
    },
    async sendAccountRequest(msg) {
      const { subject, body } = renderAccountRequest(msg);
      await send(msg.to, subject, body);
    },
  };
}
