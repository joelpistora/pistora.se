import type { FastifyInstance } from "fastify";
import { countAdmins, createUser } from "../db/users.js";
import { generateOtp, generateUserId, hashPassword } from "./crypto.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * On startup, guarantee at least one admin exists. If the users table has no
 * admin at all (fresh database), create one from `config.adminEmail` with a
 * one-time password: mailed via the configured mailer AND logged at warn level
 * so it's impossible to miss even with the console mailer.
 */
export async function ensureAdminUser(app: FastifyInstance): Promise<void> {
  if (countAdmins(app.db, { activeOnly: false }) > 0) return;

  const id = generateUserId();
  const otp = generateOtp();
  const now = app.now();

  // No personal folder for an admin — admins browse the whole storage root.
  createUser(app.db, {
    id,
    email: app.config.adminEmail,
    role: "admin",
    passwordHash: hashPassword(otp),
    mustChangePassword: true,
    passwordExpiresAt: now + THIRTY_DAYS_MS,
    now,
  });

  await app.mailer.sendInvite({ to: app.config.adminEmail, otp });
  app.log.warn(
    { email: app.config.adminEmail, otp },
    "bootstrap admin created — sign in with this one-time password, then set a real one",
  );
}
