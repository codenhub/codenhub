import { AppError } from "../index";

/** Opt-in registry preset for common Supabase Auth, database, and function errors. */
export const supabaseErrorRegistry = AppError.createRegistry();

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
    "23505",
    {
      message: "A record with this value already exists.",
      messageKey: "error.supabase.database.uniqueViolation",
      source: "supabase.database",
    },
  ],
]);

supabaseErrorRegistry.names.add("FunctionsHttpError", {
  message: "Edge Function request failed.",
  messageKey: "error.supabase.functions.http",
  source: "supabase.functions",
  retryable: true,
});
