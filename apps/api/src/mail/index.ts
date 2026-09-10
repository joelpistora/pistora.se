import type { FastifyBaseLogger } from "fastify";

/**
 * Outbound email. Only one message type today: the invite that carries a
 * one-time password. `ConsoleMailer` is the shipping implementation for now — it
 * logs the full message and the OTP so an operator can pass it on by hand. A
 * real transport (Resend, SMTP, …) becomes a new `Mailer` built in `server.ts`
 * from an env var and handed to `buildApp` as a dep; nothing else changes.
 */

export interface InviteMessage {
  to: string;
  otp: string;
  /** Absolute URL of the sign-in page, when the API knows it. */
  loginUrl?: string;
}

export interface Mailer {
  sendInvite(msg: InviteMessage): Promise<void>;
}

export function renderInvite(msg: InviteMessage): { subject: string; body: string } {
  const where = msg.loginUrl ? `\n\nSign in: ${msg.loginUrl}` : "";
  return {
    subject: "You've been added to Pistora",
    body:
      `You've been added to Pistora file storage.\n\n` +
      `Email:            ${msg.to}\n` +
      `One-time password: ${msg.otp}\n\n` +
      `Sign in with these, and you'll be asked to set your own password.` +
      where,
  };
}

export function createConsoleMailer(log: FastifyBaseLogger): Mailer {
  return {
    async sendInvite(msg) {
      const { subject, body } = renderInvite(msg);
      log.info(
        { to: msg.to, otp: msg.otp, subject, body },
        "invite email (console mailer — not actually sent)",
      );
    },
  };
}

/** Test double: records every message instead of sending it. */
export function createCaptureMailer(): Mailer & { sent: InviteMessage[] } {
  const sent: InviteMessage[] = [];
  return {
    sent,
    async sendInvite(msg) {
      sent.push(msg);
    },
  };
}
