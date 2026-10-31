---
title: Presets
description: Every failure the browser, Node.js, and Supabase presets recognize, with its translation key, and what each preset leaves out.
order: 4
---

# Presets

A preset is a ready-made, read-only registry for failures that come from a platform or a service rather than from your own code. There are three: browser, Node.js, and Supabase. Each is a separate import, so an application only loads the ones it uses, and importing one changes nothing until you merge it:

```ts
import { getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

getErrorRegistry().merge(browserErrorRegistry);
```

Each preset also exports its raw mappings, frozen, for when you want to build something of your own from part of a preset:

| Import path                           | Registry                | Raw mappings                                |
| ------------------------------------- | ----------------------- | ------------------------------------------- |
| `@codenhub/error/registries/browser`  | `browserErrorRegistry`  | `browserErrorNames`, `browserErrorPatterns` |
| `@codenhub/error/registries/node`     | `nodeErrorRegistry`     | `nodeErrorCodes`, `nodeErrorPatterns`       |
| `@codenhub/error/registries/supabase` | `supabaseErrorRegistry` | `supabaseErrorCodes`, `supabaseErrorNames`  |
| `@codenhub/error/registries`          | All three               | All six                                     |

## How the messages are written

Every preset message says what happened and what the reader can do next, in plain words, and claims only what the matched identifier proves. None of them assumes your application has a password reset page, a support chat, or any other feature; where the reader can do nothing else, a message says to contact support without naming how.

Failures only a developer can fix, such as a missing table or column, share one message that says the problem is not the reader's doing and names no internals: "Something went wrong on our side, and it isn't caused by anything you did. Contact support if it keeps happening." The details stay on `originalError` for your logs.

When your application can say something more useful, register your own mapping for the same identifier after merging the preset; the later one wins.

Every mapping has a `messageKey`. The keys are stable, and each key always carries the same message, so a translation catalog can rely on them. Several identifiers can share one key when they mean the same thing to the reader. ErrorKit does not ship translations; see [Recipes](recipes.md#translate-messages).

## Browser

For code that runs in a browser. It recognizes the `DOMException` names the Web APIs raise, a failed `fetch`, and a code-split chunk that fails to load.

| Name                 | `messageKey`                         | Retryable |
| -------------------- | ------------------------------------ | --------- |
| `AbortError`         | `error.browser.abort`                | No        |
| `QuotaExceededError` | `error.browser.storageQuotaExceeded` | No        |
| `NotAllowedError`    | `error.browser.permissionDenied`     | No        |
| `NotFoundError`      | `error.browser.notFound`             | No        |
| `SecurityError`      | `error.browser.security`             | No        |
| `TimeoutError`       | `error.browser.timeout`              | No        |
| `NotSupportedError`  | `error.browser.notSupported`         | No        |
| `InvalidStateError`  | `error.browser.invalidState`         | No        |
| `NetworkError`       | `error.browser.network`              | No        |
| `NotReadableError`   | `error.browser.notReadable`          | No        |
| `EncodingError`      | `error.browser.encoding`             | No        |
| `ChunkLoadError`     | `error.browser.moduleLoadFailed`     | No        |

Its patterns match whole messages only, so text that merely contains the same words is not classified:

| Message                                                                                                                                                                                  | `messageKey`                     | Retryable |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| A failed `fetch`: `Failed to fetch` (Chromium), `NetworkError when attempting to fetch resource.` (Firefox), `Load failed` (Safari)                                                      | `error.browser.requestFailed`    | No        |
| A failed `import()`: `Failed to fetch dynamically imported module: …` (Chromium), `error loading dynamically imported module: …` (Firefox), `Importing a module script failed.` (Safari) | `error.browser.moduleLoadFailed` | No        |

Notes:

- **Nothing is retryable.** A failed `fetch` looks the same whether the connection never opened or the response was lost after the server acted on the request, as a CORS block or a dropped connection does. A `TimeoutError` from `AbortSignal.timeout()` can fire after the server received the request. The messages ask the reader to check whether the action went through before trying again.
- **A failed chunk is usually a tab left open across a deploy**: the page asks for a file the new deploy removed. The message tells the reader to reload. `ChunkLoadError` is what webpack throws; Vite and other bundlers that use native `import()` produce the browser's message.
- **`AbortError` is often deliberate.** It also fires when your own code cancels a request, such as an effect cleanup or a newer search replacing an older one. See [Caveats](caveats.md#cancelled-requests-are-errors-too).

## Node.js

For server code. It recognizes network failures from sockets, DNS lookups, and the built-in `fetch`, which puts the real failure on the `cause` of its `TypeError: fetch failed`.

| Code                      | `messageKey`                             | Retryable |
| ------------------------- | ---------------------------------------- | --------- |
| `ECONNREFUSED`            | `error.node.network.connectionRefused`   | Yes       |
| `ENOTFOUND`               | `error.node.network.addressNotFound`     | Yes       |
| `UND_ERR_CONNECT_TIMEOUT` | `error.node.network.connectionTimeout`   | Yes       |
| `EAI_AGAIN`               | `error.node.network.addressLookupFailed` | Yes       |
| `EHOSTUNREACH`            | `error.node.network.unreachable`         | Yes       |
| `ENETUNREACH`             | `error.node.network.unreachable`         | Yes       |
| `ECONNRESET`              | `error.node.network.connectionReset`     | No        |
| `UND_ERR_SOCKET`          | `error.node.network.connectionClosed`    | No        |
| `EPIPE`                   | `error.node.network.connectionClosed`    | No        |
| `ETIMEDOUT`               | `error.node.network.responseTimeout`     | No        |
| `UND_ERR_HEADERS_TIMEOUT` | `error.node.network.responseTimeout`     | No        |
| `UND_ERR_BODY_TIMEOUT`    | `error.node.network.responseTimeout`     | No        |

| Message                             | `messageKey`                       | Retryable |
| ----------------------------------- | ---------------------------------- | --------- |
| `fetch failed`, with no known cause | `error.node.network.requestFailed` | No        |

Notes:

- **The messages speak about "a service this depends on".** On a server, the failing call is your server calling something else, so the person reading the message is not the one whose connection failed, and the messages do not ask them to check it.
- **Only failures before a connection is made are retryable**: refused, an address that did not resolve, an unreachable host, a connection timeout. A reset, a closed socket, or a response timeout can follow a request the other side already acted on. `ETIMEDOUT` is not retryable either, because Node.js raises it both for a connection attempt and for a socket that already carried the request.
- **Not covered:** filesystem codes such as `ENOENT`, because the right message depends on what the application was doing, and TLS certificate codes, which only an operator can fix. `AbortError` and `TimeoutError` from an `AbortSignal` are `DOMException` names on Node.js too; merge the browser preset to classify them.
- The codes were observed on Node.js 24. Other server runtimes, such as Deno or Bun, may report network failures differently.

## Supabase

For code that calls Supabase. It recognizes the Auth error codes a person using your application can run into and do something about, a few PostgreSQL error codes, and the error names the Supabase client raises.

Supabase Auth codes:

| Code                                | `messageKey`                                         | Retryable |
| ----------------------------------- | ---------------------------------------------------- | --------- |
| `invalid_credentials`               | `error.supabase.auth.invalidCredentials`             | No        |
| `email_not_confirmed`               | `error.supabase.auth.emailNotConfirmed`              | No        |
| `phone_not_confirmed`               | `error.supabase.auth.phoneNotConfirmed`              | No        |
| `user_already_exists`               | `error.supabase.auth.userAlreadyExists`              | No        |
| `email_exists`                      | `error.supabase.auth.emailExists`                    | No        |
| `phone_exists`                      | `error.supabase.auth.phoneExists`                    | No        |
| `signup_disabled`                   | `error.supabase.auth.signupDisabled`                 | No        |
| `provider_disabled`                 | `error.supabase.auth.methodUnavailable`              | No        |
| `email_provider_disabled`           | `error.supabase.auth.methodUnavailable`              | No        |
| `phone_provider_disabled`           | `error.supabase.auth.methodUnavailable`              | No        |
| `otp_disabled`                      | `error.supabase.auth.methodUnavailable`              | No        |
| `provider_email_needs_verification` | `error.supabase.auth.providerEmailNeedsVerification` | No        |
| `otp_expired`                       | `error.supabase.auth.otpExpired`                     | No        |
| `invite_not_found`                  | `error.supabase.auth.inviteNotFound`                 | No        |
| `weak_password`                     | `error.supabase.auth.weakPassword`                   | No        |
| `same_password`                     | `error.supabase.auth.samePassword`                   | No        |
| `email_address_invalid`             | `error.supabase.auth.emailAddressInvalid`            | No        |
| `validation_failed`                 | `error.supabase.auth.validationFailed`               | No        |
| `captcha_failed`                    | `error.supabase.auth.captchaFailed`                  | No        |
| `user_banned`                       | `error.supabase.auth.userBanned`                     | No        |
| `user_not_found`                    | `error.supabase.auth.userNotFound`                   | No        |
| `session_expired`                   | `error.supabase.auth.sessionEnded`                   | No        |
| `session_not_found`                 | `error.supabase.auth.sessionEnded`                   | No        |
| `refresh_token_not_found`           | `error.supabase.auth.sessionEnded`                   | No        |
| `refresh_token_already_used`        | `error.supabase.auth.sessionEnded`                   | No        |
| `reauthentication_needed`           | `error.supabase.auth.reauthenticationNeeded`         | No        |
| `reauthentication_not_valid`        | `error.supabase.auth.reauthenticationNotValid`       | No        |
| `mfa_verification_failed`           | `error.supabase.auth.mfaVerificationFailed`          | No        |
| `mfa_challenge_expired`             | `error.supabase.auth.mfaChallengeExpired`            | No        |
| `insufficient_aal`                  | `error.supabase.auth.insufficientAal`                | No        |
| `flow_state_expired`                | `error.supabase.auth.signInInterrupted`              | No        |
| `flow_state_not_found`              | `error.supabase.auth.signInInterrupted`              | No        |
| `bad_oauth_callback`                | `error.supabase.auth.signInInterrupted`              | No        |
| `pkce_code_verifier_not_found`      | `error.supabase.auth.signInInterrupted`              | No        |
| `bad_oauth_state`                   | `error.supabase.auth.badOAuthState`                  | No        |
| `sms_send_failed`                   | `error.supabase.auth.smsSendFailed`                  | No        |
| `over_sms_send_rate_limit`          | `error.supabase.auth.overSmsSendRateLimit`           | No        |
| `over_email_send_rate_limit`        | `error.supabase.auth.overEmailSendRateLimit`         | No        |
| `over_request_rate_limit`           | `error.supabase.auth.overRequestRateLimit`           | No        |
| `request_timeout`                   | `error.supabase.auth.requestTimeout`                 | No        |
| `unexpected_failure`                | `error.supabase.auth.unexpectedFailure`              | No        |

PostgreSQL codes, as returned by Supabase's database API:

| Code    | Meaning                          | `messageKey`                                  | Retryable |
| ------- | -------------------------------- | --------------------------------------------- | --------- |
| `23502` | A required value is missing      | `error.supabase.database.notNullViolation`    | No        |
| `23503` | Linked data is missing or in use | `error.supabase.database.foreignKeyViolation` | No        |
| `23505` | A unique value is taken          | `error.supabase.database.uniqueViolation`     | No        |
| `42P01` | A table does not exist           | `error.supabase.database.undefinedTable`      | No        |
| `42703` | A column does not exist          | `error.supabase.database.undefinedColumn`     | No        |
| `57014` | A query took too long            | `error.supabase.database.timeout`             | No        |

Error names raised by the Supabase client:

| Name                      | `messageKey`                       | Retryable |
| ------------------------- | ---------------------------------- | --------- |
| `AuthSessionMissingError` | `error.supabase.auth.sessionEnded` | No        |
| `FunctionsHttpError`      | `error.supabase.functions.http`    | No        |
| `FunctionsRelayError`     | `error.supabase.functions.relay`   | No        |
| `FunctionsFetchError`     | `error.supabase.functions.fetch`   | No        |

Notes:

- **Nothing is retryable.** Rate-limit errors need a wait the flag cannot express, so retrying on them at once only counts against the limit again; their messages tell the reader how long to wait. Edge Function errors arrive after the function may have run.
- **`AuthSessionMissingError` has no code.** It is what most Auth calls return when nobody is signed in, and it is classified as an ended session. `pkce_code_verifier_not_found` is raised by the client itself, when a sign-in link is opened in a different browser from the one that asked for it.
- **Not covered:** Auth codes only a developer can resolve, such as `bad_jwt` and the `hook_*` and `saml_*` families. They resolve to `"unknown"`, which is what you want reported.
- **`23505` is generic on purpose.** "A unique value is taken" cannot say which value. Register your own `23505` mapping where you know, or classify a specific table's errors against its own registry.
