/**
 * Supabase error preset: common Postgres and Auth codes mapped to safe feedback.
 *
 * @packageDocumentation
 */

import { freezeFeedbackMap } from "../bucket";
import { createErrorRegistry, freezeRegistry } from "../registry";
import { DEVELOPER_FAULT_MESSAGE } from "./messages";

const SESSION_ENDED = {
  message: "Your session has ended. Sign in again to continue.",
  messageKey: "error.supabase.auth.sessionEnded",
  source: "supabase.auth",
};

const SIGN_IN_INTERRUPTED = {
  message: "We couldn't finish signing you in because the sign-in attempt expired or was interrupted. Start again.",
  messageKey: "error.supabase.auth.signInInterrupted",
  source: "supabase.auth",
};

const METHOD_UNAVAILABLE = {
  message: "This sign-in method isn't available. Choose a different way to sign in.",
  messageKey: "error.supabase.auth.methodUnavailable",
  source: "supabase.auth",
};

/**
 * Raw code mapping definitions for common Supabase service errors.
 *
 * Includes the Supabase Auth codes a person using the application can run into and act on, and
 * selected Postgres database codes. Auth codes that only a developer can resolve, such as
 * `bad_jwt` or the `hook_*` and `saml_*` families, are left out. The Auth codes follow the list
 * Supabase publishes at https://supabase.com/docs/guides/auth/debugging/error-codes.
 */
export const supabaseErrorCodes = freezeFeedbackMap({
  invalid_credentials: {
    message: "We couldn't sign you in. The email or password is incorrect. Check them and try again.",
    messageKey: "error.supabase.auth.invalidCredentials",
    source: "supabase.auth",
  },
  email_not_confirmed: {
    message:
      "We couldn't sign you in because your email address isn't confirmed yet. Open the confirmation link we sent you, then try again.",
    messageKey: "error.supabase.auth.emailNotConfirmed",
    source: "supabase.auth",
  },
  phone_not_confirmed: {
    message:
      "We couldn't sign you in because your phone number isn't confirmed yet. Enter the code we sent you, then try again.",
    messageKey: "error.supabase.auth.phoneNotConfirmed",
    source: "supabase.auth",
  },
  user_already_exists: {
    message: "We couldn't create the account because one already exists with these details. Sign in instead.",
    messageKey: "error.supabase.auth.userAlreadyExists",
    source: "supabase.auth",
  },
  email_exists: {
    message: "This email address is already in use. Sign in with it, or use a different email address.",
    messageKey: "error.supabase.auth.emailExists",
    source: "supabase.auth",
  },
  phone_exists: {
    message: "This phone number is already in use. Sign in with it, or use a different phone number.",
    messageKey: "error.supabase.auth.phoneExists",
    source: "supabase.auth",
  },
  signup_disabled: {
    message: "New accounts can't be created right now. If you already have an account, sign in instead.",
    messageKey: "error.supabase.auth.signupDisabled",
    source: "supabase.auth",
  },
  provider_disabled: METHOD_UNAVAILABLE,
  email_provider_disabled: METHOD_UNAVAILABLE,
  phone_provider_disabled: METHOD_UNAVAILABLE,
  otp_disabled: METHOD_UNAVAILABLE,
  provider_email_needs_verification: {
    message: "We sent you an email to verify your address. Open the link in it to finish signing in.",
    messageKey: "error.supabase.auth.providerEmailNeedsVerification",
    source: "supabase.auth",
  },
  otp_expired: {
    message: "This code or link has expired or was already used. Request a new one and try again.",
    messageKey: "error.supabase.auth.otpExpired",
    source: "supabase.auth",
  },
  invite_not_found: {
    message: "This invitation has expired or was already used. Ask for a new invitation.",
    messageKey: "error.supabase.auth.inviteNotFound",
    source: "supabase.auth",
  },
  weak_password: {
    message: "This password isn't strong enough. Choose a longer password that is harder to guess.",
    messageKey: "error.supabase.auth.weakPassword",
    source: "supabase.auth",
  },
  same_password: {
    message: "The new password is the same as your current one. Choose a different password.",
    messageKey: "error.supabase.auth.samePassword",
    source: "supabase.auth",
  },
  email_address_invalid: {
    message: "This email address can't be used. Check it for mistakes, or use a different one.",
    messageKey: "error.supabase.auth.emailAddressInvalid",
    source: "supabase.auth",
  },
  validation_failed: {
    message: "Some of the details you entered aren't in the expected format. Check them and try again.",
    messageKey: "error.supabase.auth.validationFailed",
    source: "supabase.auth",
  },
  captcha_failed: {
    message: "We couldn't confirm the verification challenge. Complete it again and retry.",
    messageKey: "error.supabase.auth.captchaFailed",
    source: "supabase.auth",
  },
  user_banned: {
    message: "This account has been suspended, so you can't sign in. Contact support if you think this is a mistake.",
    messageKey: "error.supabase.auth.userBanned",
    source: "supabase.auth",
  },
  user_not_found: {
    message: "We couldn't find this account. It may have been deleted. Sign in again or create a new account.",
    messageKey: "error.supabase.auth.userNotFound",
    source: "supabase.auth",
  },
  session_expired: SESSION_ENDED,
  session_not_found: SESSION_ENDED,
  refresh_token_not_found: SESSION_ENDED,
  refresh_token_already_used: SESSION_ENDED,
  reauthentication_needed: {
    message: "For your security, confirm it's you before making this change. Sign in again, then retry.",
    messageKey: "error.supabase.auth.reauthenticationNeeded",
    source: "supabase.auth",
  },
  reauthentication_not_valid: {
    message: "The confirmation code is incorrect. Check it and try again, or request a new one.",
    messageKey: "error.supabase.auth.reauthenticationNotValid",
    source: "supabase.auth",
  },
  mfa_verification_failed: {
    message: "The verification code is incorrect. Check your authenticator and enter the current code.",
    messageKey: "error.supabase.auth.mfaVerificationFailed",
    source: "supabase.auth",
  },
  mfa_challenge_expired: {
    message: "The verification step took too long and expired. Start it again and enter the code promptly.",
    messageKey: "error.supabase.auth.mfaChallengeExpired",
    source: "supabase.auth",
  },
  insufficient_aal: {
    message: "This needs an extra verification step. Complete two-step verification, then try again.",
    messageKey: "error.supabase.auth.insufficientAal",
    source: "supabase.auth",
  },
  flow_state_expired: SIGN_IN_INTERRUPTED,
  flow_state_not_found: SIGN_IN_INTERRUPTED,
  bad_oauth_callback: SIGN_IN_INTERRUPTED,
  bad_oauth_state: {
    message: SIGN_IN_INTERRUPTED.message,
    messageKey: "error.supabase.auth.badOAuthState",
    source: "supabase.auth",
  },
  sms_send_failed: {
    message: "We couldn't send the text message. Check the phone number and try again.",
    messageKey: "error.supabase.auth.smsSendFailed",
    source: "supabase.auth",
  },
  over_sms_send_rate_limit: {
    message: "We've sent too many text messages to this number. Wait a few minutes before requesting another.",
    messageKey: "error.supabase.auth.overSmsSendRateLimit",
    source: "supabase.auth",
  },
  over_email_send_rate_limit: {
    message: "We've sent too many emails to this address. Wait a few minutes before requesting another.",
    messageKey: "error.supabase.auth.overEmailSendRateLimit",
    source: "supabase.auth",
  },
  over_request_rate_limit: {
    message: "Too many attempts were made in a short time. Wait a few minutes, then try again.",
    messageKey: "error.supabase.auth.overRequestRateLimit",
    source: "supabase.auth",
  },
  request_timeout: {
    message: "This took too long to complete. Check whether it went through before trying again.",
    messageKey: "error.supabase.auth.requestTimeout",
    source: "supabase.auth",
  },
  unexpected_failure: {
    message: DEVELOPER_FAULT_MESSAGE,
    messageKey: "error.supabase.auth.unexpectedFailure",
    source: "supabase.auth",
  },
  "23505": {
    message: "This couldn't be saved because an entry with the same value already exists. Change it and try again.",
    messageKey: "error.supabase.database.uniqueViolation",
    source: "supabase.database",
  },
  "23503": {
    message:
      "This couldn't be completed because it's linked to other data that is missing or still in use. Check the items it refers to, then try again.",
    messageKey: "error.supabase.database.foreignKeyViolation",
    source: "supabase.database",
  },
  "23502": {
    message: "This couldn't be saved because a required field is empty. Fill in every required field and try again.",
    messageKey: "error.supabase.database.notNullViolation",
    source: "supabase.database",
  },
  "42P01": {
    message: DEVELOPER_FAULT_MESSAGE,
    messageKey: "error.supabase.database.undefinedTable",
    source: "supabase.database",
  },
  "42703": {
    message: DEVELOPER_FAULT_MESSAGE,
    messageKey: "error.supabase.database.undefinedColumn",
    source: "supabase.database",
  },
  "57014": {
    message: "This took too long and was stopped before it finished. Try again in a moment.",
    messageKey: "error.supabase.database.timeout",
    source: "supabase.database",
  },
});

/**
 * Raw name mapping definitions for common Supabase service errors.
 *
 * Includes name mappings for edge function execution issues.
 */
export const supabaseErrorNames = freezeFeedbackMap({
  FunctionsHttpError: {
    message:
      "This couldn't be completed because the service reported a problem. Try again, and contact support if it keeps happening.",
    messageKey: "error.supabase.functions.http",
    source: "supabase.functions",
  },
  FunctionsRelayError: {
    message: "We couldn't reach the service that handles this. Try again in a moment.",
    messageKey: "error.supabase.functions.relay",
    source: "supabase.functions",
    isRetryable: true,
  },
  FunctionsFetchError: {
    message: "We couldn't reach the server. Check your internet connection and try again.",
    messageKey: "error.supabase.functions.fetch",
    source: "supabase.functions",
  },
});

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
