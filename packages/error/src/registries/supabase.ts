import { createErrorRegistry } from "../index";

/**
 * Opt-in mutable registry preset for common Supabase Auth, database, and function errors.
 * Importing this preset does not contact Supabase services.
 */
export const supabaseErrorRegistry = createErrorRegistry();

supabaseErrorRegistry.codes.addList([
  [
    "invalid_credentials",
    {
      message: "Invalid email or password.",
      messageKey: "error.supabase.auth.invalidCredentials",
      source: "supabase.auth",
    },
  ],
  [
    "email_not_confirmed",
    {
      message: "Email address is not confirmed.",
      messageKey: "error.supabase.auth.emailNotConfirmed",
      source: "supabase.auth",
    },
  ],
  [
    "user_already_exists",
    {
      message: "An account with this email address already exists.",
      messageKey: "error.supabase.auth.userAlreadyExists",
      source: "supabase.auth",
    },
  ],
  [
    "signup_disabled",
    {
      message: "Signups are currently disabled.",
      messageKey: "error.supabase.auth.signupDisabled",
      source: "supabase.auth",
    },
  ],
  [
    "otp_expired",
    {
      message: "One-time password has expired.",
      messageKey: "error.supabase.auth.otpExpired",
      source: "supabase.auth",
    },
  ],
  [
    "sms_send_failed",
    {
      message: "Failed to send SMS message.",
      messageKey: "error.supabase.auth.smsSendFailed",
      source: "supabase.auth",
      retryable: true,
    },
  ],
  [
    "over_sms_send_rate_limit",
    {
      message: "SMS send rate limit exceeded. Please try again later.",
      messageKey: "error.supabase.auth.overSmsSendRateLimit",
      source: "supabase.auth",
    },
  ],
  [
    "over_email_send_rate_limit",
    {
      message: "Email send rate limit exceeded. Please try again later.",
      messageKey: "error.supabase.auth.overEmailSendRateLimit",
      source: "supabase.auth",
    },
  ],
  [
    "invalid_grant",
    {
      message: "Invalid login credentials or refresh token.",
      messageKey: "error.supabase.auth.invalidGrant",
      source: "supabase.auth",
    },
  ],
  [
    "bad_oauth_state",
    {
      message: "Invalid OAuth state.",
      messageKey: "error.supabase.auth.badOAuthState",
      source: "supabase.auth",
    },
  ],
  [
    "23505",
    {
      message: "A record with this value already exists.",
      messageKey: "error.supabase.database.uniqueViolation",
      source: "supabase.database",
    },
  ],
  [
    "23503",
    {
      message: "Referenced record could not be found.",
      messageKey: "error.supabase.database.foreignKeyViolation",
      source: "supabase.database",
    },
  ],
  [
    "23502",
    {
      message: "A required field is missing.",
      messageKey: "error.supabase.database.notNullViolation",
      source: "supabase.database",
    },
  ],
  [
    "42P01",
    {
      message: "Database table not found.",
      messageKey: "error.supabase.database.undefinedTable",
      source: "supabase.database",
    },
  ],
  [
    "42703",
    {
      message: "Database column not found.",
      messageKey: "error.supabase.database.undefinedColumn",
      source: "supabase.database",
    },
  ],
  [
    "57014",
    {
      message: "Database query timed out or was cancelled.",
      messageKey: "error.supabase.database.timeout",
      source: "supabase.database",
      retryable: true,
    },
  ],
]);

supabaseErrorRegistry.names.addList([
  [
    "FunctionsHttpError",
    {
      message: "Edge Function request failed.",
      messageKey: "error.supabase.functions.http",
      source: "supabase.functions",
      retryable: true,
    },
  ],
  [
    "FunctionsRelayError",
    {
      message: "Edge Function relay failed.",
      messageKey: "error.supabase.functions.relay",
      source: "supabase.functions",
      retryable: true,
    },
  ],
  [
    "FunctionsFetchError",
    {
      message: "Failed to fetch Edge Function.",
      messageKey: "error.supabase.functions.fetch",
      source: "supabase.functions",
      retryable: true,
    },
  ],
]);
