import { isApiError, isNetworkError } from "@/lib/api";

/** Turn any thrown login/change-password error into a sentence for the user. */
export function authErrorMessage(err: unknown): string {
  if (isNetworkError(err)) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (isApiError(err)) {
    switch (err.code) {
      case "unauthorized":
        return err.message || "Incorrect email or password.";
      case "account_disabled":
        return "This account has been disabled. Contact an administrator.";
      case "otp_expired":
        return "Your one-time password has expired. Ask an administrator to resend your invite.";
      case "too_many_requests":
        return "Too many attempts. Wait a minute, then try again.";
      case "weak_password":
        return err.message;
      case "validation":
        return "Please check the form and try again.";
      default:
        return err.message || "Something went wrong.";
    }
  }
  return "Something went wrong.";
}
