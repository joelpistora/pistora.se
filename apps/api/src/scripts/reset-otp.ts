/**
 * Reset a user's password to a fresh one-time password and print it.
 *
 * The account-recovery hatch until transactional email is wired up: an admin who
 * never caught their bootstrap OTP (or any user who lost theirs) gets a new one
 * from the machine that runs the API.
 *
 *   npm run reset-otp --workspace api -- <email>
 *
 * With no email argument it targets ADMIN_EMAIL. Safe to run while the API is
 * up — SQLite WAL handles the concurrent write; the next login picks it up.
 */
import { generateOtp, hashPassword } from "../auth/crypto.js";
import { loadConfig } from "../config.js";
import { openDb } from "../db/index.js";
import { deleteSessionsForUser } from "../db/sessions.js";
import { getUserByEmail, issueOtp } from "../db/users.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

try {
  process.loadEnvFile();
} catch {
  // no .env — rely on the real environment
}

const config = loadConfig();
const email = (process.argv[2] ?? config.adminEmail).trim().toLowerCase();

const db = openDb(config.dbPath);
const user = getUserByEmail(db, email);
if (!user) {
  console.error(`no user with email ${email}`);
  process.exit(1);
}

const otp = generateOtp();
const now = Date.now();
issueOtp(db, user.id, hashPassword(otp), now + SEVEN_DAYS_MS, now);
deleteSessionsForUser(db, user.id);
db.close();

console.log(`\n  ${email}\n  one-time password: ${otp}\n  expires in 7 days — you'll set a real password on first sign-in\n`);
