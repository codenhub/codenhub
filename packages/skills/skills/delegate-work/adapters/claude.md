# Claude Code adapter

For when Claude is **not** the orchestrator. While Claude orchestrates, Claude
routes share its quota pool and `dispatch` returns `use_native` instead.

Verified against Claude Code 2.1.282 on Windows with a Pro login and real runs
of `haiku` (in place, worktree, read-only, resume, denied edit and shell).
Re-check these points when Claude Code updates.

## How a run is invoked

    claude -p --output-format stream-json --verbose --model <model>
      --restricted --tools Read,Glob,Grep[,Edit,Write,Bash]
      --allowedTools <rules...> [--disallowedTools <rules...>]
      --permission-mode dontAsk
      --disable-slash-commands --strict-mcp-config --no-chrome
      [--effort <variant>] [--resume <session_id>]

- The prompt goes through **stdin**.
- `--restricted` ignores user, project and local settings files, confines the
  file tools to the work dir, refuses `bypassPermissions`, and protects git and
  settings files. `--tools` is the whole tool set: no subagents, web tools or
  notebooks. `--disable-slash-commands` turns skills off (so a worker can't
  load this skill), `--strict-mcp-config` without `--mcp-config` loads no MCP
  servers.
- Not `--bare`: it only accepts API-key auth, so a subscription login can't
  be used. Not `--safe-mode`: it also drops the project's CLAUDE.md.
- Read-only workers get `Read`, `Glob` and `Grep` only: no shell. With
  `git log` allowed, `git log --output=<path>` writes anywhere.
- Editing workers' allow rules: `Edit(<glob>)` per `--allow` glob (relative
  to the work dir; covers Write too), `Bash(<cmd>)` and `Bash(<cmd>:*)` for
  the check commands, read-only git, and `cd`. Claude checks every part of a
  compound command and often writes `cd "<repo>" && npm run test`, so `cd`
  must be allowed. Deny rules, which win over allow rules, block git's
  `--output`, `--no-index`, `--ext-diff` and `--textconv`. Everything else is
  denied by `dontAsk`.
- Check commands take any arguments, so workers can narrow a test run. A
  test run executes code the worker wrote, outside any sandbox: the rules
  limit what the worker types, not what its code does. The diff, and the
  checks dispatch runs itself, are the gate.
- Model ids: aliases (`sonnet`, `opus`, `haiku`) or full ids. There is no
  listing command, so `doctor` can't validate them.

## Environment

A parent Claude Code session (desktop app, CLI, SDK) exports around two dozen
`CLAUDE*` variables: session ids, a messaging socket and token. Workers get
all of them removed except `CLAUDE_CODE_OAUTH_TOKEN` and `CLAUDE_CONFIG_DIR`.
`ANTHROPIC_*` variables pass through; they may be the user's own API setup.

## Auth

- `claude auth status --json` reports stored credentials, not whether they
  still refresh. An expired login fails at run time with "OAuth session
  expired and could not be refreshed", classified `auth`; after that failure
  the CLI clears the stored login and `detect` reports "not logged in".
- `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) outranks the stored
  login and is the documented choice for scripts. The Claude desktop app does
  not pass it into its own sessions.
- Worker sessions persist (needed for `--resume`), so they appear in the
  user's Claude Code session history.

## Events parsed

`system`/`init` (`session_id`, tools, permission mode), `assistant` content
(`text`; `tool_use` counts a step and is matched to its result by id), `user`
content (`tool_result`; a successful `Edit`/`Write` feeds the scope watchdog
with an absolute `file_path`; an error mentioning permission goes to
`denied`), `system`/`permission_denied`, and `result`.

`result` carries `is_error`, `result` (the final text), `session_id` and
`permission_denials[]` (`tool_name`, `tool_input`). A failed run can still say
`subtype: "success"`: go by `is_error`.

A denied tool result tells the model it "may attempt to accomplish this action
using other tools"; the worker preamble says not to, and the diff decides
scope either way.
