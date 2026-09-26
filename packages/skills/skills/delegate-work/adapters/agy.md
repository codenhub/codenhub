# agy adapter

Antigravity CLI (`agy`). Verified against agy 1.2.11 on Windows with a Google
account login and real runs of `gemini-3.8-flash-*` (in place, worktree,
read-only, follow-up, check commands, denied reads and commands, a server
503). Linux is not verified. Re-check these points when agy updates: most of
them are observed behavior, not documented.

Needs 1.1.1 or later: earlier headless runs hang in a subprocess and print
nothing on server errors.

## How a run is invoked

    agy --input-format stream-json --output-format stream-json
      --model <model> --agent dispatch-read|dispatch-edit|dispatch-edit-shell
      --project <id> --disable-slash-commands [--effort <variant>]
      [--conversation <conversation_id>]

- The prompt goes through **stdin** as one line,
  `{"event":"user","message":{"content":"..."}}`; closing stdin ends the
  session. `--input-format stream-json` starts print mode by itself. Not
  `-p`: it takes the next argument as its prompt.
- Model ids come from `agy models` (`gemini-3.8-flash-high`, ...); the effort
  level is part of most ids. An unknown id fails at once with "is not
  recognized as a known model" (`unavailable`).
- Follow-ups resume with `--conversation`.

## Worker home

agy reads settings, agents, projects, MCP servers, plugins, skills and
permission grants from `~/.gemini`, found through `USERPROFILE` on Windows and
`HOME` elsewhere. Workers run with both pointed at `<state dir>/agy-home`, so
none of the user's configuration applies: not their grants (an MCP tool, a
URL, file access outside the workspace), not their MCP servers or plugins.
Nothing is written to the user's `~/.gemini`.

Credentials are not under `~/.gemini`: on Windows they are in the Credential
Manager (`gemini:antigravity`), so a run in the worker home stays signed in.
Where credentials live on Linux was not verified; `detect` lists models
through the worker home, so a home that loses the login shows up there.

The worker home keeps agy's own conversation history and per-run project
files; `dispatch prune` doesn't clean it. Concurrent runs share it, so its
files are written only when their content changes, and replaced whole.

## Tools and permissions

Headless agy never asks. A tool whose permission resolves to **ask** is
refused and **ends the whole turn**: the worker stops without its RESULT
block, the run exits 0, and stderr says "a tool required the "<perm>"
permission that headless mode cannot prompt for". A **deny** is refused and
the turn goes on. So what a worker must not do is removed or denied outright.

- **Tools.** Three agents in the worker home fix the whole tool set with
  `tools:` in `agent.md`. `dispatch-read`: `view_file`, `list_dir`,
  `find_by_name`, `grep_search`. `dispatch-edit` adds `write_to_file`,
  `replace_file_content`, `multi_replace_file_content`. `dispatch-edit-shell`
  adds `run_command`, and is used when the role has check commands. No web
  search, browser, subagents, image generation, scheduling or messaging.
  The `init` event lists every tool regardless; the model only gets the
  agent's.
- **settings.json** denies `read_url(*)`, `execute_url(*)` and `mcp(*)`.
- **Per-run grants** go in a project file (`--project`), since
  `settings.json` is shared by concurrent runs. In a fresh home nothing
  outside the temp dir is writable, not even the work dir, so editing roles
  get `write_file(<work dir>)`. The id is a hash of the grants, so a follow-up
  selects the same project.
- **Commands.** A command needs both `command(<cmd>)` and `unsandboxed(<cmd>)`,
  and headless agy matches them **exactly**: `npm run test` allows neither
  `npm run test -- x` nor `npm run test && x`. Editing workers get the check
  commands, each exactly, and are told that anything else ends their session.
  A `deny` on `command(*)` or `unsandboxed(*)` would override those grants.
- **Temp dir.** agy lets any tool read and write the temp dir. The project
  denies `read_file` and `write_file` on it unless the work dir is inside it;
  a work dir in the temp dir leaves the rest of it readable.
- **Scope.** The write grant covers the whole work dir, so scope is enforced
  from edit events (the watchdog) and the diff, as for Codex.
- `--mode plan` is not read-only headless: it auto-approves its own plan and
  edits. Read-only roles rely on the tool set instead.

No effect on headless runs in 1.2.11 (tried while designing the above):
`allow` rules for commands without their `unsandboxed` grant,
`trustedWorkspaces` and `allowNonWorkspaceAccess` in `settings.json`,
`config.json` user settings (`internetPolicy`, `fileAccessPolicy`,
`nonWorkspaceFileAccessPolicy`), and `disabledTools` in agent files.

## Events parsed

`init` (`conversation_id`), `step_update` with `step_type`:

- `tool`: `ACTIVE` counts a step; `DONE` of an edit tool feeds the scope
  watchdog with `parameters.TargetFile` (absolute); `ERROR` with a permission
  message goes to `denied` with the tool and its target. agy's own notes
  (plans, walkthroughs) are written under the worker home and are not edits.
- `agent_response`: `text_delta` chunks, one message per `step_index`. The
  final text is every message joined; the result's `response` concatenates
  them the same way.

`result` carries `status` (`SUCCESS`, `ERROR`, ...), `error`, `response` and
`denied_actions` (soft denials only, without their target, so the tool
events are used instead).

## Failures

- Server unavailable: `Eligibility check failed: UNAVAILABLE (code 503)`, in
  `result.error` and on stderr, exit 1 → `transient`.
- Unknown model: "model x is not recognized as a known model", exit 1 →
  `unavailable`.
- Signed out and quota exhaustion were not observed.
