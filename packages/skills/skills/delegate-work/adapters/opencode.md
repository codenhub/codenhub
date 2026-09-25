# OpenCode adapter

Verified against OpenCode 1.18.32 on Windows with real models (Gemini via API
key, GPT 6 via ChatGPT login) and on Linux with a fake harness. Re-check these
points when OpenCode updates; the model list itself changes between versions
(the GPT 6 ids first appear in 1.18.32).

## How a run is invoked

    opencode run --format json --print-logs --log-level ERROR \
      --agent dispatch-worker -m <provider/model> --dir <workdir> [--variant <v>]
      (--title dispatch-worker | --session <id>)

- The prompt goes through **stdin**. This avoids Windows' command-line length
  limit and keeps user text away from `cmd.exe` parsing.
- `--print-logs --log-level ERROR` is required: JSON error events only say
  "Unexpected server error"; the real cause (model not found, auth, rate limit)
  is on stderr as `error="..."`.
- `--title` on new sessions: without it OpenCode makes an extra request to the
  same model to generate a session title, which costs real quota on
  rate-limited free tiers.
- On Windows, `opencode` is an npm `.cmd` shim, run through `cmd.exe` with a
  command line built from vetted arguments (see `scripts/lib/proc.mjs`).

## Permissions

The `dispatch-worker` agent is injected per run through `OPENCODE_CONFIG_CONTENT`.
Nothing is written to the user's OpenCode config.

- In `run` mode, any permission that resolves to "ask" is **auto-rejected**
  (printed as `permission requested: ...; auto-rejecting`).
- A configured `deny` fails the tool call with "The user has specified a rule
  which prevents you from using this specific tool call" plus a dump of every
  rule. The attempted action (`bash: <command>`, `edit: <path>`) goes into
  `denied`, not the rule dump.
- `edit` patterns are paths relative to the work dir, so the allowlist blocks
  out-of-scope writes before they happen. On Windows both slash styles are
  registered. OpenCode's `*` crosses directories, so `**` is collapsed to `*`.
- `bash` allows only the resolved check commands and read-only git commands.
  OpenCode matches each subcommand separately: `git status && x`,
  `npm run test; x` and `npm run test -- $(x)` are all denied.
- `webfetch`, `websearch`, `external_directory`, `task`, `question`,
  `doom_loop` are denied. Reading `.env*` already resolves to "ask" by default,
  so it is auto-rejected too.

## Events parsed

`step_start` (step budget), `text` (final message = text of the last step),
`error` (with `data.statusCode` when the provider returned one, e.g. 503 with
`isRetryable: true` for Gemini's "high demand"),
`tool_use` with `edit`/`write`/`patch`/`multiedit`/`apply_patch` and
`state.status: completed` (scope watchdog; `filePath` is absolute), and
`sessionID` on every event (follow-ups).

## Failures

OpenCode retries provider errors itself (about 1–3 minutes for Gemini 503s)
before emitting a final `error` event. Classification uses that final error
and the last `error="..."` on stderr; earlier errors in the stderr tail were
already retried past and only count when the final one is unrecognized.

## Route options

- `variant`: provider-specific reasoning effort (`high`, `max`, `minimal`).
- `options`: merged into the injected agent config (e.g. `temperature`).

## Logins

Subscription logins (ChatGPT, etc.) and API keys come from `opencode auth login`.
Plugins are not disabled, since some providers authenticate through plugins.
A provider that isn't logged in shows up as "model not found"; `dispatch doctor`
checks every route's model id against `opencode models`.
