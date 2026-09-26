# Codex adapter

Verified against Codex CLI 0.157.0 on Windows with a ChatGPT login and real
runs of `gpt-6-luna` (in place, worktree, read-only, resume), and 0.157.1 for
writes through linked dependency folders. Re-check these points when Codex
updates; 0.111 → 0.157 renamed and removed flags.

## How a run is invoked

    codex exec --json --ignore-user-config -m <model>
      -c sandbox_mode=read-only|workspace-write -c approval_policy=never
      -c web_search=disabled -c sandbox_workspace_write.network_access=false
      --disable <feature>... [-c windows.sandbox=<mode>] [-c model_reasoning_effort=<v>]
      -C <workdir> -

    codex exec resume <same options> <thread_id> -      (follow-ups)

- The prompt goes through **stdin** (`-`).
- `--ignore-user-config` skips `~/.codex/config.toml` but keeps auth. A user
  config can load plugins, MCP servers (computer use, browsers) and a `notify`
  hook on every turn; none of that belongs in a worker. Everything a worker
  needs is passed with `-c`.
- `resume` has no `--cd` or `--sandbox`: the sandbox is set with `-c`, and the
  process cwd is the work dir.
- Disabled features: `multi_agent`, `computer_use`, `browser_use`,
  `browser_use_external`, `in_app_browser`, `image_generation`, `plugins`,
  `apps`, `goals`, `skill_mcp_dependency_install`.
- Model ids have no provider prefix (`gpt-6-luna`). `doctor` checks them
  against `~/.codex/models_cache.json`, which any Codex run refreshes. The
  cache reports a 272k context window for GPT 6 models.

## Scope and sandbox

Codex has no per-file edit allowlist. Scope is enforced after the fact:
`file_change` events feed the watchdog, and the diff decides `out_of_scope`.

`workspace-write` lets a worker write its work dir and, by default, the whole
temp directory; not the home directory and not `.git`. This is why run state
and worktrees live under `~/.local/state`, not in the temp dir. Network is off.

Extra writable roots (`sandbox_workspace_write.writable_roots`) make the
unelevated Windows sandbox refuse to run at all ("cannot enforce split
writable root sets"), so workers get no private temp dir.

A worktree links the repository's dependency folders. The sandbox checks
where a write lands, so writes through a link into a repository under the
home directory are refused, by the shell and by `apply_patch` alike. A
repository inside the temp dir is the exception: the link lands in the
writable temp dir and the real folder would change, unseen by the diff. When
a linked folder resolves into the temp dir, the run sets
`sandbox_workspace_write.exclude_tmpdir_env_var` and `exclude_slash_tmp`,
which the unelevated sandbox accepts.

## Windows

- `windows.sandbox` defaults to `unelevated`; set `"windowsSandbox":
  "elevated"` on a route to use the elevated sandbox. `doctor` probes both.
- The elevated sandbox needs a one-time setup (sandbox users, firewall rules).
  It can break independently of dispatch: on the verification machine its
  setup refresh failed validating the Codex desktop app's own runtime files.
- The unelevated sandbox refuses child processes with piped stdio
  (`spawn EPERM`), which is how most test runners start workers (`node
  --test`, vitest, jest). Workers are told this in a note appended to the
  prompt; dispatch runs the checks itself, outside the sandbox.
- `-c` values avoid double quotes: TOML that fails to parse is taken as a raw
  string (`windows.sandbox=unelevated`), and double quotes can't pass through
  the `.cmd` shim safely.

## Events parsed

`thread.started` (`thread_id` for resume), `item.started` of
`command_execution` / `file_change` / `mcp_tool_call` / `web_search` (step
budget), `item.completed` `agent_message` (final message = last one),
`file_change` (`changes[].path`, absolute), `command_execution` (`exit_code`,
`aggregated_output`; sandbox refusals go to `denied` whatever the exit code,
since PowerShell's "Access to the path '...' is denied" exits 0), `error` and
`turn.failed` (message is often a JSON body with `status`).

An `item.completed` of type `error` is a warning (for example missing model
metadata), not a failure. Commands the sandbox refuses before they start
appear only on stderr (`Rejected(...)`), and so do refused patch writes (a
failed `file_change` plus "Failed to write file <path>" on stderr);
`parseStderr` collects both.

## Failures

- Unknown or unsupported model: `HTTP 400 ... model is not supported when
  using Codex with a ChatGPT account` → `unavailable`.
- Usage limits: matched as `rate_limit`, with "try again in N hours" parsed
  into the cooldown. The exact wording was not observed.
