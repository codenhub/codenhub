import { createErrorRegistry, freezeRegistry } from "../registry";
import type { ErrorFeedback } from "../types";

/**
 * Raw code mapping definitions for common Supabase service errors.
 *
 * Includes Postgres database codes and Supabase Auth specific error codes.
 */
export const supabaseErrorCodes: Record<string, ErrorFeedback> = {
  invalid_credentials: {
    message: "Invalid email or password.",
    messageKey: "error.supabase.auth.invalidCredentials",
    source: "supabase.auth",
  },
  email_not_confirmed: {
    message: "Email address is not confirmed.",
    messageKey: "error.supabase.auth.emailNotConfirmed",
    source: "supabase.auth",
  },
  user_already_exists: {
    message: "An account with this email address already exists.",
    messageKey: "error.supabase.auth.userAlreadyExists",
    source: "supabase.auth",
  },
  signup_disabled: {
    message: "Signups are currently disabled.",
    messageKey: "error.supabase.auth.signupDisabled",
    source: "supabase.auth",
  },
  otp_expired: {
    message: "One-time password has expired.",
    messageKey: "error.supabase.auth.otpExpired",
    source: "supabase.auth",
  },
  sms_send_failed: {
    message: "Failed to send SMS message.",
    messageKey: "error.supabase.auth.smsSendFailed",
    source: "supabase.auth",
    isRetryable: true,
  },
  over_sms_send_rate_limit: {
    message: "SMS send rate limit exceeded. Please try again later.",
    messageKey: "error.supabase.auth.overSmsSendRateLimit",
    source: "supabase.auth",
  },
  over_email_send_rate_limit: {
    message: "Email send rate limit exceeded. Please try again later.",
    messageKey: "error.supabase.auth.overEmailSendRateLimit",
    source: "supabase.auth",
  },
  invalid_grant: {
    message: "Invalid login credentials or refresh token.",
    messageKey: "error.supabase.auth.invalidGrant",
    source: "supabase.auth",
  },
  bad_oauth_state: {
    message: "Invalid OAuth state.",
    messageKey: "error.supabase.auth.badOAuthState",
    source: "supabase.auth",
  },
  "23505": {
    message: "A record with this value already exists.",
    messageKey: "error.supabase.database.uniqueViolation",
    source: "supabase.database",
  },
  "23503": {
    message: "Referenced record could not be found.",
    messageKey: "error.supabase.database.foreignKeyViolation",
    source: "supabase.database",
  },
  "23502": {
    message: "A required field is missing.",
    messageKey: "error.supabase.database.notNullViolation",
    source: "supabase.database",
  },
  "42P01": {
    message: "Database table not found.",
    messageKey: "error.supabase.database.undefinedTable",
    source: "supabase.database",
  },
  "42703": {
    message: "Database column not found.",
    messageKey: "error.supabase.database.undefinedColumn",
    source: "supabase.database",
  },
  "57014": {
    message: "Database query timed out or was cancelled.",
    messageKey: "error.supabase.database.timeout",
    source: "supabase.database",
    isRetryable: true,
  },
};

/**
 * Raw name mapping definitions for common Supabase service errors.
 *
 * Includes name mappings for edge function execution issues.
 */
export const supabaseErrorNames: Record<string, ErrorFeedback> = {
  FunctionsHttpError: {
    message: "Edge Function request failed.",
    messageKey: "error.supabase.functions.http",
    source: "supabase.functions",
    isRetryable: true,
  },
  FunctionsRelayError: {
    message: "Edge Function relay failed.",
    messageKey: "error.supabase.functions.relay",
    source: "supabase.functions",
    isRetryable: true,
  },
  FunctionsFetchError: {
    message: "Failed to fetch Edge Function.",
    messageKey: "error.supabase.functions.fetch",
    source: "supabase.functions",
    isRetryable: true,
  },
};

const registry = createErrorRegistry();

registry.codes.addList(Object.entries(supabaseErrorCodes));
registry.names.addList(Object.entries(supabaseErrorNames));

/**
 * An opt-in, read-only error registry pre-populated with mappings for common Supabase service errors.
 *
 * Includes code mappings for Supabase Auth (e.g., rate limits, invalid credentials) and PostgreSQL
 * database errors (e.g., foreign key violations, unique constraint violations), as well as name
 * mappings for edge function execution issues.
 *
 * Importing this preset does not establish any network connection to Supabase services or require client dependencies.
 */
export const supabaseErrorRegistry = freezeRegistry(registry);
