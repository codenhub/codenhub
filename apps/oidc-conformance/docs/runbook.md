---
status: DRAFT
last_updated: 2026-11-13
scope: How to deploy apps/oidc-conformance, run the OpenID conformance suite's Basic OP and Config OP plans against it, read the results, and record them.
---

# Conformance host runbook

`apps/oidc-conformance` is a Cloudflare Worker that serves `@codenhub/oidc` for the [OpenID Foundation's conformance suite](https://www.certification.openid.net). The plans need an OpenID Provider reachable from the suite's runner, and `packages/oidc/docs/internal/roadmap.md` ("The OpenID conformance suite") and `packages/oidc/docs/internal/scope.md` decisions 30, 39 and 52 say why the run is the 0.1 criterion. Nothing here is deployed by the repository: the maintainer runs the steps below, because a deploy is outward-facing.

## What the host is

- One Durable Object, `ConformanceHost`, answers every request. It holds the provider, `createMemoryStore` from `@codenhub/oidc/testing`, and the sessions of the browsers that signed in. The suite's requests reach different isolates, and the provider keeps no state between requests, so everything that must persist (codes, tokens, interactions) lives in that one object.
- **State is in memory and is lost when the object is evicted or the Worker is redeployed.** That is acceptable for a test host: the test that was running fails, and re-running its module starts from a clean state. Do not deploy a new version while a plan is running.
- The ID token signing key is an RS256 pair generated when the object starts, so `id_token_signing_alg_values_supported` lists `RS256`, which the Config OP plan requires. It is never stored or committed, and a restart publishes a new key under a new `kid`.
- There is no login page. The authorization endpoint (`/authorize`) signs the one test user in and consents on their behalf, with a session cookie (`conformance_session`, `Secure; HttpOnly; SameSite=None`) that records when that browser last signed in. `prompt=none` answers `login_required` for a browser without the cookie, `prompt=login` and a `max_age` older than the session sign in again, and `/logout` ends the session without asking for confirmation. The user's claims are fixed in `src/user.ts`.
- On start the host proves that the control client refuses an authorization request without PKCE, even with a `nonce`. If it does not, the host answers every request with a `500` that says so. `GET /self-check` answers `{"ok":true,...}` once the host has started.
- Clients, registered from the environment:

| Client                | Authenticates with    | PKCE         | Secret                  |
| --------------------- | --------------------- | ------------ | ----------------------- |
| `conformance-1`       | `client_secret_basic` | not required | `CLIENT_SECRET_1`       |
| `conformance-2`       | `client_secret_basic` | not required | `CLIENT_SECRET_2`       |
| `conformance-post`    | `client_secret_post`  | not required | `CLIENT_SECRET_POST`    |
| `conformance-control` | `client_secret_basic` | required     | `CLIENT_SECRET_CONTROL` |

Each suite client has one redirect URI, `https://www.certification.openid.net/test/a/<SUITE_ALIAS>/callback`, and may request `openid profile email address phone offline_access`. The control client's redirect URI ends in `<SUITE_ALIAS>-control/callback`, which the suite never uses.

## Configuration

| Name                    | Kind          | Meaning                                                                                                      |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `ISSUER`                | var           | The public `https` origin the Worker is served from, with no trailing slash. It is the issuer byte for byte. |
| `SUITE_ALIAS`           | var           | The alias of the test plans. It becomes part of every callback URL, so make it unique to this project.       |
| `SUITE_ORIGIN`          | var, optional | The suite's origin. Defaults to `https://www.certification.openid.net`.                                      |
| `CLIENT_SECRET_1`       | secret        | The secret of `conformance-1`.                                                                               |
| `CLIENT_SECRET_2`       | secret        | The secret of `conformance-2`.                                                                               |
| `CLIENT_SECRET_POST`    | secret        | The secret of `conformance-post`.                                                                            |
| `CLIENT_SECRET_CONTROL` | secret        | The secret of `conformance-control`.                                                                         |

The host hashes each secret with `hashClientSecret` when it starts, so the store never holds one. A missing name makes every request answer `500` with the names that are missing and no values. A request for any origin but `ISSUER`'s answers `500` too, because the provider routes by origin and would otherwise answer `404` for everything.

## Deploy

Run these from the repository root. They create resources in your Cloudflare account, which is why an agent does not run them.

1. Build the provider, which the Worker bundles from `packages/oidc/dist`: `pnpm build oidc`.
2. Pick the public URL. A `workers.dev` URL works, and it is printed by the first deploy. Put it in `ISSUER` and choose a `SUITE_ALIAS` in `apps/oidc-conformance/wrangler.jsonc`. If you do not know the URL yet, deploy once, then edit `ISSUER` and deploy again.
3. Generate four secrets, one per client, and set them. Each one is 256 random bits; keep them out of the repository, shell history shared with others, and logs. Run the generator once before each `wrangler secret put` and paste its output at that prompt, so no two clients share a secret; the plan configurations need the same values later:

```sh
# Once per secret below: a new value each time.
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
cd apps/oidc-conformance
pnpm exec wrangler secret put CLIENT_SECRET_1
pnpm exec wrangler secret put CLIENT_SECRET_2
pnpm exec wrangler secret put CLIENT_SECRET_POST
pnpm exec wrangler secret put CLIENT_SECRET_CONTROL
```

4. Deploy: `pnpm exec wrangler deploy` from `apps/oidc-conformance`. The first deploy applies the `v1` migration, which creates the SQLite-backed `ConformanceHost` class.
5. Check that it started: `curl https://<issuer>/self-check` answers `{"ok":true,"controlClient":"conformance-control","requiresPkce":true}`, and `https://<issuer>/.well-known/openid-configuration` lists `RS256` under `id_token_signing_alg_values_supported`. `pnpm exec wrangler tail` shows the provider's diagnostics (`OIDC token 400 code_verifier_unexpected conformance-1`): the endpoint, status, reason and client, never a value the request carried.

To tear it down, run `pnpm exec wrangler delete` from `apps/oidc-conformance`. The secrets exist only on the Worker and in the suite's plan configurations, so deleting both leaves nothing to rotate.

## Run the plans

Sign in at https://www.certification.openid.net and choose "Create a new test plan" under "Test an OpenID Provider".

### Config OP

Plan `oidcc-config-certification-test-plan`. It reads the discovery document only. Its configuration:

```json
{
  "alias": "<SUITE_ALIAS>",
  "description": "@codenhub/oidc, Config OP",
  "server": { "discoveryUrl": "<ISSUER>/.well-known/openid-configuration" }
}
```

### Basic OP

Plan `oidcc-basic-certification-test-plan` ("Basic OP"), with the variants `response_type=code` and `client_secret_basic`. Paste this configuration, with the secrets you set above:

```json
{
  "alias": "<SUITE_ALIAS>",
  "description": "@codenhub/oidc, Basic OP",
  "server": { "discoveryUrl": "<ISSUER>/.well-known/openid-configuration" },
  "client": { "client_id": "conformance-1", "client_secret": "<CLIENT_SECRET_1>" },
  "client2": { "client_id": "conformance-2", "client_secret": "<CLIENT_SECRET_2>" },
  "client_secret_post": { "client_id": "conformance-post", "client_secret": "<CLIENT_SECRET_POST>" }
}
```

The suite's own instructions ask for three static clients: two `client_secret_basic` clients, because some modules prove that a code is bound to its client, and one `client_secret_post` client, which may be the first when the provider lets one client use either method. This provider fixes one method per client, so `conformance-post` is separate. The field names above are the ones the configuration form is expected to have; they were written without access to the suite, so check them against the form's help text before the first run. If the form has no field for the `client_secret_post` client, the module `oidcc-server-client-secret-post` authenticates with `client`, and fails with `invalid_client`: that is the provider's one method per client, not a host fault, and is reported in the results.

Create the plan with the alias in the configuration, then run every module. The host needs no login page, so the suite's browser sees only the final callback. `oidcc-ensure-registered-redirect-uri` ends at an error page, because the provider never redirects to a redirect URI it has not registered. The suite asks for a screenshot of that page (a `400` page headed `Error`, with the issue codes) unless the configuration has a `browser` section that matches it. Upload the screenshot by hand, or add a section as the suite's browser-control documentation describes.

The Basic OP plan has modules that wait 30 seconds or more (`oidcc-codereuse-30seconds`, `oidcc-max-age-1`). Do not redeploy during a run.

## What to expect

| Module                                                      | Expected                           | Why                                                                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oidcc-ensure-request-without-nonce-succeeds-for-code-flow` | FAILED                             | The request sends neither PKCE nor a `nonce`. The provider refuses it with `invalid_request` for a client with `requirePkce: false` (scope.md decision 52). See the argument below.                            |
| `oidcc-userinfo-post-body`                                  | Unknown                            | The provider reads the userinfo access token only from the `Authorization` header and answers `401` for one in the body (`tests/host.test.ts` shows it). RFC 6750 §2.2 makes the body method optional.         |
| `oidcc-server-client-secret-post`                           | Unknown                            | Passes only when the plan configuration gives it the `conformance-post` client, as above.                                                                                                                      |
| The request-object and `claims` parameter modules           | Skipped or accepted as unsupported | Discovery says `request_parameter_supported`, `request_uri_parameter_supported` and `claims_parameter_supported` are `false`, and the provider answers `request_not_supported` or `request_uri_not_supported`. |
| Every other Basic OP module and the Config OP plan          | PASSED                             | Nothing known fails them. Anything else that fails is a finding: copy the module name, the log URL, and the host's `wrangler tail` lines.                                                                      |

`oidcc-userinfo-post-body`: the roadmap's Notes believe the module tolerates a refusal. If it reports FAILED, the choice is between accepting the module's failure in the submission and accepting a form-encoded `access_token` at userinfo, which puts a token where logs and caches see it. That is a decision about a security property, so it is made in `scope.md`, not here.

### The argument for `oidcc-ensure-request-without-nonce-succeeds-for-code-flow`

OpenID Connect Core makes `nonce` optional in the authorization code flow, and the module checks that a request with neither `nonce` nor PKCE still works. The provider refuses it on purpose, for a client that has turned PKCE off. Without PKCE, the `nonce` is the only thing that ties the code response to the request that started it, so a request with neither has no defense against authorization code injection (OAuth 2.1 §7.5.1.1, RFC 9700 §2.1.1). The provider lets an operator waive PKCE for a client that checks the `nonce`, which the Basic OP plan needs, and no setting waives both, because a third setting would let an operator register a client with no defense at all in order to pass one module. Every other request in the plan, including the ones that send PKCE, passes. State this in the submission together with the module's log, and ask the Foundation (certification@oidf.org) how it treats a stricter provider before relying on the argument.

## Recording the results

For each plan, after the last module ends:

1. Note the plan's URL, the date, the `@codenhub/oidc` version and commit the host was built from, and each module's result. The suite's "Publish" and log-export buttons make the evidence a link and a file.
2. Edit `packages/oidc/docs/internal/roadmap.md`, "The OpenID conformance suite": state which plans ran and which modules did not pass, each with its cause and whether it is a provider fix or an argued exception. Keep the PKCE paragraph, and replace the Notes bullet about `oidcc-userinfo-post-body` with what the run showed.
3. A module that fails for a reason the host cannot fix is a provider defect: file it as `CONTRIBUTING.md` describes, and do not work around it in the host. A decision it changes goes in `scope.md`, as a new decision that names the one it reverses.
4. When both plans pass or fail only the modules argued above, the 0.1 criterion of decision 39 is met, and the roadmap item can leave the list of work to do.
