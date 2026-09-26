# delegate-work

Splits coding work across subagents. Uses the current harness's native
subagents first; can also dispatch scoped tasks to other models through CLI
harnesses (OpenCode, Codex, Antigravity CLI and Claude Code).

## Requirements

Node 20+, git 2.41+, and at least one supported harness installed and logged in.

## Setup

    node scripts/dispatch.mjs init      # creates your personal config
    node scripts/dispatch.mjs doctor    # validates config, harnesses, model ids

`init` copies `config/workers.json` (neutral defaults) to your user config at
`$XDG_CONFIG_HOME/delegate-work/workers.json`, by default
`~/.config/delegate-work/workers.json` on every OS (on Windows,
`C:\Users\<you>\.config\...`).

Edit that file, not the one in this repo. It holds your models, routes, tiers,
and per-project overrides (check commands, data policy, files to copy into
worktrees). Override the location with `DELEGATE_WORK_CONFIG`.

## Data policy

Routes marked `trainsOnData` (e.g. free API tiers) are blocked unless
`allowTraining` is true globally or for the project path.

## What stays out of your repos

Run state, logs and worktrees live in `$XDG_STATE_HOME/delegate-work`,
by default `~/.local/state/delegate-work` on every OS
(`DELEGATE_WORK_STATE` to override).

Why the home directory:

- Not the temp directory: sandboxed workers may write anywhere in it (Codex's
  workspace-write sandbox does, and agy allows it by default), and the state
  directory holds every run's worktree.
- Not AppData on Windows: packaged apps (the Claude desktop app is one) get
  newly created AppData folders redirected to a private copy, so dispatch run
  from them and from a terminal would not share config or state.

Snapshots are unreferenced git objects that `git gc` removes. Worktrees are
removed on apply/discard. `dispatch prune` removes run state older than
`limits.pruneAfterHours` (default 24), including worktrees nobody applied or
discarded.

agy workers run with their own agy home in the state directory (`agy-home`),
so your `~/.gemini` configuration neither applies to them nor changes; it
keeps agy's history of worker conversations, which `prune` leaves alone.

Dependency folders are linked into worktrees (junctions on Windows).
`git worktree remove` follows junctions on Windows and deletes the real
folder, so dispatch never uses it: every link is unlinked first, the files are
deleted with `fs.rmSync` (which does not follow links), and git only prunes
its record of the worktree.

Restores and applies are byte-exact: dispatch runs git with line-ending
conversion and `.gitattributes` filters off, so a CRLF checkout
(`core.autocrlf=true`) stays CRLF and an LF file stays LF.

Dispatch's own git commands also run no programs from repository config
(`core.fsmonitor`, external diff, textconv). A worktree's `.git` file, which
points git at the repository and so at its config, is put back as git wrote
it after every worker and after the checks; a changed one makes the run
`out_of_scope`.

## Checks

`fixer` runs the fast set, `builder` the full set. A project's `checks.fast` /
`checks.full` in your config replace inference entirely. Otherwise every
ecosystem found at the repository root contributes:

- **Node** (`package.json`): its scripts: `typecheck`, `check` or
  `lint` + `format:check`, `test`; the full set adds `build`, or runs only
  `verify` when there is one. The package manager comes from
  `packageManager` or the lockfile.
- **Rust** (`Cargo.toml`): `cargo clippy --workspace --all-targets` (or
  `cargo check` without clippy) and `cargo test --workspace`;
  `cargo fmt --all --check` only with a `rustfmt.toml`. In a worktree the first
  build is cold.
- **Python** (`pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`):
  runs through the project's `.venv`/`venv`, else `poetry run`/`pdm run`, else
  the system Python. mypy, pyright, ruff and black run only when configured
  (and installed, with a venv); pytest when configured or listed as a
  dependency, otherwise `unittest discover` if there is a `tests/` directory.
  A `uv.lock` without `.venv` gets no checks, because `uv run` would create one
  in the repository. Poetry keeps its venvs outside the project by default,
  keyed by path, so a worktree finds none: set `virtualenvs.in-project` or
  configure the checks.

Worktrees get the project's venv linked. Its editable install still points at
the repository, so with a `src/` directory the checks (and the worker) get
`PYTHONPATH=src` to test the worktree's code.

## Trust boundary

Harness permissions limit what a worker can do while it runs: which files it
edits and which commands it runs. They don't sandbox the code it writes. The
checks run that code with your permissions and environment, as your own test
run would, and a worker in place edits your real working tree; dispatch
restores out-of-scope files afterwards, it doesn't prevent writing them. Give
workers the same trust you give the models behind them, and keep untrusted
routes off repositories whose tests reach credentials or production systems.

## Harness notes

Per-harness mechanics, verified versions and known limits:
[`adapters/opencode.md`](adapters/opencode.md), [`adapters/codex.md`](adapters/codex.md),
[`adapters/agy.md`](adapters/agy.md), [`adapters/claude.md`](adapters/claude.md).

## Context windows

A route's usable context is the smallest of the model's `context`, the
route's optional `context`, and what the harness reports (OpenCode's
models.dev metadata, Codex's model cache × its effective percentage). Reported
values are cached for a day in the state directory; `doctor` refreshes them
and flags drift of more than 10% between config and harness.
