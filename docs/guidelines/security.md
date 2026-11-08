---
status: APPROVED
last_updated: 2026-11-08
scope: How code keeps the project's security commitments, for anyone writing or reviewing a change.
---

# Security guidelines

This document says how code handles secrets, untrusted input, and what leaves the process, so the same problem is solved the same way everywhere. Vulnerabilities are reported as [SECURITY.md](../../SECURITY.md) describes, never in a public issue.

<!-- project:start -->

CodenHub ships libraries that run inside other people's apps. The trust boundary is each package's public API: anything a caller passes in may have come from that app's users, and a package treats it as data, never as instructions. A package that defends against hostile input states what each input gets in its own public docs, as `@codenhub/oidc` does in [Hostile input](../../packages/oidc/docs/security.md) and `@codenhub/validation` in [Limits](../../packages/validation/docs/limits.md). Where a package's own documentation and this one disagree, the package's wins for that package, and this one is fixed.

<!-- project:end -->

## Secrets

When the project stores or issues secrets:

- **Random values** for anything security-relevant come from a cryptographically secure source, such as `crypto.getRandomValues` or `crypto.randomUUID`, injected where code needs to be testable. Never `Math.random`.
- **High-entropy tokens** the project issues, such as session ids, one-time codes, reset tokens, and API keys, are stored as a digest, never as the value. A leaked database then holds nothing a client can present.
- **Passwords** go through a memory-hard key derivation function where the runtime allows, with the algorithm and parameters stored next to each hash so they can be upgraded on the next login.
- **Recoverable secrets**, ones the project must read back, are encrypted with an authenticated cipher, with a key id stored beside each ciphertext so the key can be rotated.
- **Comparisons** of a secret or digest against input are constant-time.
- **Showing a secret** happens once, in the response to the action that created it, and that response is never cached.
- **Secrets in the repository** do not exist. Configuration reads them from the environment or a secret store; examples use obvious placeholders.

## Never in logs, errors, or responses

- An error message names the field, never its value.
- An unexpected error reaches the caller as a generic failure. Its detail goes only to the log, which redacts known secret-bearing fields.
- URLs can carry codes and tokens in their query strings. Log the path, not the full URL.
- Page content, form values, and anything a user typed stay out of logs.
- Where a leak would matter, a test proves it: it feeds known secrets through the flow and asserts they never appear in what was logged, returned, or stored.

## Untrusted input

- Every input crossing a trust boundary is validated at that boundary, before any other code sees it, and parsed into a typed value. What does not parse is rejected, not passed along.
- Every input has a size bound: a body is read with a byte limit before parsing, and every string and collection in a schema has a maximum.
- Files a user can edit by hand, such as settings, sessions, and caches, are untrusted input too. A file that does not parse is set aside and replaced with defaults, and every value read from one is checked as if it came from a request.
- Do not build URLs, paths, or redirects from values a client controls, such as the `Host` or `X-Forwarded-*` headers. A redirect target comes from an allowlist and is compared exactly.
- Do not build a query, command, or HTML by concatenating input. Use parameters, argument arrays, and escaping by default.

## Web responses and sessions

When the project serves web requests:

- Every response goes through one place that sets the security headers, including a Content Security Policy. A route never loosens them.
- No inline script, unless it carries a per-response nonce.
- Authenticated pages and every response holding a secret are not cached.
- Session cookies are `HttpOnly`, `Secure`, and `SameSite=Lax` or stricter, and `__Host-` prefixed where possible.
- Every state-changing request uses a non-GET method and is protected against cross-site request forgery.
- Every authorization check runs on the server, declared where the route is defined, before the handler runs.

## Outbound calls and dependencies

- The project calls only services it needs for the feature at hand, or that its operator configured. No telemetry, update checks, or third-party lookups without a recorded decision and, where users are affected, a way to turn them off.
- Every dependency is a trust decision. The rule in [Coding guidelines](code.md#architecture-and-design) on adding dependencies applies with extra force to anything that runs at install time or handles secrets.

<!-- project:start -->

## Packages that handle untrusted input

### Tokens in `@codenhub/jwt` and `@codenhub/oidc`

- **A token is untrusted until verified.** No claim, header, or `kid` from a token decides how it is verified. The algorithm comes from the key, never from the token, and `none` is not an algorithm in any casing ([`@codenhub/jwt`](../../packages/jwt/README.md)).
- **A token that is ambiguous is rejected.** A header member name repeated at any depth fails as `duplicate_key`, where `JSON.parse` would silently keep the last one, and a `kid` no key set holds fails as `unknown_kid` ([Verifying](../../packages/jwt/docs/verifying.md), [Key sets](../../packages/jwt/docs/key-sets.md)).
- **Every input from the other side has a stated outcome.** A change to a provider endpoint or a client request updates [Hostile input](../../packages/oidc/docs/security.md) and the test that proves the outcome.

### Bounded cost in `@codenhub/validation`

- **A failing input has a bounded cost.** Reporting stops at a fixed number of issues per collection, and nesting deeper than a recursive schema's `maxDepth` is one issue, not a stack overflow ([Limits](../../packages/validation/docs/limits.md)). A new collection or recursive validator keeps both bounds, with a test that feeds it input past each one.

### Issues never hold input values

- **An issue never holds a value of the input**, so logging a failed validation cannot log a password that was sent. An issue may hold what the schema was configured with, such as the values a `oneOf` accepts, and the input's keys, in `path` ([`@codenhub/validation`](../../packages/validation/README.md)). It is the rule above, "An error message names the field, never its value", applied to issues: a package that reports issues follows it, and a new issue code adds a test that its issue holds no input value.

<!-- project:end -->

## Reviewing a change

A change that touches any of the above names it in its pull request and adds or updates its tests. The [pull request template](../../.github/pull_request_template.md) carries the check. Ask:

- Does it add a way for untrusted input to reach the code? Is that input validated and bounded at the boundary?
- Does a secret, token, user's data, or full URL now reach a log, error, or response?
- Does it store a secret, and is it stored as a digest or encrypted as above?
- Does it add a permission, capability, endpoint, or outbound call? Is that named in the pull request and tested?
- Does it read a file a user can edit, and check what it reads?

<!-- project:start -->

- Does a package now read a token claim or header before the token is verified, or let one choose how it is verified?
- Does a new validator or collection keep the issue and depth bounds, with a test past each?
- Does a new error or issue carry any value from the input?

<!-- project:end -->
