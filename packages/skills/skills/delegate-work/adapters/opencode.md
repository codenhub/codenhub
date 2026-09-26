# OpenCode adapter

Supports OpenCode 1.x and 2.x; the major version from `opencode --version`
picks the invocation and config shape. Verified against 2.0.17 on Windows with
real models (GPT 6 via ChatGPT login, Gemini via API key, GLM via OpenRouter),
and against 1.18.32 on Windows (Gemini via API key, GPT 6 via ChatGPT login)
and on Linux with a fake harness. Re-check these points when OpenCode updates;
the model list itself changes between versions.

## How a run is invoked

    2.x: opencode run --format json --standalone --print-logs --log-level error \
           --agent dispatch-worker -m <provider/model>[#<variant>]
           (--title dispatch-worker | --session <id>)

    1.x: opencode run --format json --print-logs --log-level ERROR \
           --dir <workdir> --agent dispatch-worker -m <provider/model> [--variant <v>]
           (--title dispatch-worker | --session <id>)

- The prompt goes through **stdin**. This avoids Windows' command-line length
  limit and keeps user text away from `cmd.exe` parsing.
- 2.x runs sessions in one shared background service per user, which never
  sees a run's environment, so the injected worker config wouldn't reach it.
  `--standalone` starts a private server for the run instead. 2.x has no
  `--dir` (the process cwd is the work dir) and no `--variant` (it joins the
  model after `#`).
- `--print-logs`: 1.x JSON error events only say "Unexpected server error";
  the real cause (model not found, auth, rate limit) is on stderr as
  `error="..."`. 2.x error events carry the cause themselves; its logs are
  kept for diagnosis.
- `--title` on new sessions: without it OpenCode makes an extra request to the
  same model to generate a session title, which costs real quota on
  rate-limited free tiers.
- On Windows, `opencode` is an npm `.cmd` shim, run through `cmd.exe` with a
  command line built from vetted arguments (see `scripts/lib/proc.mjs`).

## Permissions

The `dispatch-worker` agent is injected per run through `OPENCODE_CONFIG_CONTENT`.
Nothing is written to the user's OpenCode config.

### 2.x

An ordered rule list, `agents.dispatch-worker.permissions`, of
`{ action, resource, effect }`; the last matching rule wins, and an unmatched
action resolves to `ask`.

- In `run`, **ask** interrupts the tool ("Tool execution interrupted"), then
  the step and the run (an `error` event of type `aborted`, exit 1). The
  attempted action goes into `denied` and the run is evaluated like one that
  finished. Everything a worker must not do is therefore denied, which fails
  only the tool call: `webfetch`, `websearch`, `external_directory`,
  `subagent`, `question`, `skill`, `execute`, and reads of `.env` files
  (except `.env.example`), which ask by default.
- `edit` covers `edit`, `write` and `patch`: denied, then allowed per
  `--allow` glob. Resources are paths relative to the work dir; `*` crosses
  directories, so `**` is collapsed to `*`.
- `shell` is denied. Editing workers get it back as `<cmd> *` (with or
  without arguments) for the check commands and read-only git, then denied
  again for git's `--output`, `--no-index`, `--ext-diff` and `--textconv`:
  `git log --output=<path>` writes anywhere and `--no-index` reads anywhere.
  Read-only workers get no shell at all; a scout with `git log` allowed was
  seen writing outside the repository that way. Chained commands
  (`git status && x`) are denied.
- Check commands take any arguments, so workers can narrow a test run. A
  test run executes code the worker wrote, with no OS sandbox: the allowlist
  limits what the worker types, not what its code does. The diff, and the
  checks dispatch runs itself, are the gate.
- A denied tool fails with "Permission denied: <action>"; the attempted
  command or file goes into `denied`.

### 1.x

Permissions grouped by tool, `agent.dispatch-worker.permission`.

- Any permission that resolves to "ask" is **auto-rejected**
  (printed as `permission requested: ...; auto-rejecting`).
- A configured `deny` fails the tool call with "The user has specified a rule
  which prevents you from using this specific tool call" plus a dump of every
  rule. The attempted action (`bash: <command>`, `edit: <path>`) goes into
  `denied`, not the rule dump.
- `edit` patterns are paths relative to the work dir, so the allowlist blocks
  out-of-scope writes before they happen. On Windows both slash styles are
  registered. OpenCode's `*` crosses directories, so `**` is collapsed to `*`.
- `bash` allows only the resolved check commands and read-only git commands,
  with the same git flags denied as in 2.x, and only for editing workers.
  OpenCode matches each subcommand separately: `git status && x`,
  `npm run test; x` and `npm run test -- $(x)` are all denied. The flag
  denies were not verified against a real 1.x.
- `webfetch`, `websearch`, `external_directory`, `task`, `question`,
  `doom_loop` are denied. Reading `.env*` already resolves to "ask" by default,
  so it is auto-rejected too.

## Events parsed

`step_start` (step budget), `text` (final message = text of the last step),
`error`, `tool_use` of `edit`/`write`/`patch`/`multiedit`/`apply_patch` with
`state.status: completed` (scope watchdog), and `sessionID` on every event
(follow-ups).

- 2.x: `edit`/`write` report a relative `input.path`; `patch` reports its
  files in `state.metadata.metadata.files[].file`, and names them in
  `patchText`. `error` events carry `error.type` (`provider.quota`,
  `aborted`, ...), `error.message` and `error.status`.
- 1.x: edit tools report an absolute `input.filePath`; `error` carries
  `data.statusCode` when the provider returned one (e.g. 503 with
  `isRetryable: true` for Gemini's "high demand").

## Failures

- 2.x Gemini free key over its per-minute limit: `provider.quota`, 429, "You
  exceeded your current quota, please check your plan and billing details
  ... Please retry in 32.6s." → `rate_limit` with that delay. The run fails
  at once; 2.0.17 did not retry it.
- 1.x retries provider errors itself (about 1–3 minutes for Gemini 503s)
  before emitting a final `error` event. Classification uses that final error
  and the last `error="..."` on stderr; earlier errors in the stderr tail were
  already retried past and only count when the final one is unrecognized.
- OpenRouter without credits was not observed: on the verification account a
  paid model (`z-ai/glm-5.3-flash`) answered normally. Billing is matched from
  the provider's wording (402, "insufficient credits").

## Route options

- `variant`: provider-specific reasoning effort (`high`, `max`, `minimal`).
- `options`: 1.x merges them into the injected agent config (e.g.
  `temperature`); 2.x sends them as the agent's request body.

## Models and logins

Subscription logins (ChatGPT, etc.) and API keys come from `opencode auth login`.
Plugins are not disabled, since some providers authenticate through plugins.
A provider that isn't logged in shows up as "model not found"; `dispatch doctor`
checks every route's model id against `opencode models`.

Context windows: 1.x prints models.dev metadata with `models --verbose`. 2.x
lists ids only; the window comes from the models.dev catalog it caches
(`models.json` in the cache dir from `opencode debug paths`). Models the
catalog doesn't know (the GPT 6 ids behind a ChatGPT login) report none.
Right after the background service starts, 2.x `models` can list nothing and
still exit 0; that counts as unknown, not as every id missing.
