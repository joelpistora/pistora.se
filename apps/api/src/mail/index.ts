import type { FastifyBaseLogger } from "fastify";

/**
 * Outbound email. Two message types: the invite that carries a one-time
 * password straight to the invitee, and the account-request notice that goes
 * to the admin when someone self-requests an account. `ConsoleMailer` is the
 * shipping implementation for now — it logs the full message and the OTP so
 * an operator can pass it on by hand. A real transport (Resend, SMTP, …)
 * becomes a new `Mailer` built in `server.ts` from an env var and handed to
 * `buildApp` as a dep; nothing else changes.
 */

export interface InviteMessage {
  to: string;
  otp: string;
  /** Absolute URL of the sign-in page, when the API knows it. */
  loginUrl?: string;
}

/** Sent to the admin when someone requests an account through the login page. */
export interface AccountRequestMessage {
  to: string;
  requesterEmail: string;
  otp: string;
}

export interface Mailer {
  sendInvite(msg: InviteMessage): Promise<void>;
  sendAccountRequest(msg: AccountRequestMessage): Promise<void>;
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

export function renderAccountRequest(
  msg: AccountRequestMessage,
): { subject: string; body: string } {
  return {
    subject: `Account request: ${msg.requesterEmail}`,
    body:
      `${msg.requesterEmail} requested a Pistora account.\n\n` +
      `Email:             ${msg.requesterEmail}\n` +
      `One-time password: ${msg.otp}\n\n` +
      `The account already exists — pass this OTP on to them to let them sign in.`,
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
    async sendAccountRequest(msg) {
      const { subject, body } = renderAccountRequest(msg);
      log.info(
        { to: msg.to, requesterEmail: msg.requesterEmail, otp: msg.otp, subject, body },
        "account request email (console mailer — not actually sent)",
      );
    },
  };
}

/** Test double: records every message instead of sending it. */
export function createCaptureMailer(): Mailer & {
  sent: InviteMessage[];
  sentAccountRequests: AccountRequestMessage[];
} {
  const sent: InviteMessage[] = [];
  const sentAccountRequests: AccountRequestMessage[] = [];
  return {
    sent,
    sentAccountRequests,
    async sendInvite(msg) {
      sent.push(msg);
    },
    async sendAccountRequest(msg) {
      sentAccountRequests.push(msg);
    },
  };
}
