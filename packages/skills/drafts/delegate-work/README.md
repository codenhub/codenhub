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

Restores and applies never write through a link. Git for Windows walks into a
junction as if it were a folder, so a junction a worker made would show its
target's files as changes in the tree; dispatch leaves any path that goes
through a symlink or junction alone and says so (`apply`, `discard` and
`unapply` report a `conflict`). When a failed attempt in place is undone
before the next route runs, the files it restores are copied into the run's
state first, in case you edited one meanwhile.

Dispatch's own git commands also run no programs from repository config
(`core.fsmonitor`, hooks, external diff, textconv): a `core.hooksPath`
inside the tree, as husky and similar setups use, is a folder a worker can
write to. Workers and checks in a worktree get the same settings. A
worktree's `.git` file, which
points git at the repository and so at its config, is put back as git wrote
it after every worker and after the checks; a changed one makes the run
`out_of_scope`.

Windows looks for a program named without a path (`git`, `taskkill`) in the
working directory before `PATH`, and a work dir is where a worker writes.
Dispatch turns that lookup off for itself and everything it starts
(`NoDefaultCurrentDirectoryInExePath`), so a `git.exe` a worker leaves in its
worktree never runs as dispatch. A worktree's dependency links are checked
before the checks run: a worker that replaced one with a folder of its own
would have the checks run its tools, so the run is `out_of_scope` instead.

Restores keep a file's executable bit and put back symbolic links from the
snapshot. `apply` never writes a symbolic link a worker made: it reports a
`conflict` naming it, since the link could point anywhere.

A running run saves its state every five minutes; a `running` state older
than 20 minutes belongs to a dispatch that is gone, whatever process now has
its pid. Stopped with Ctrl+C or a closing terminal, dispatch ends its workers
and checks too. A forced kill, which it can't catch (as some command timeouts
do), may leave the worker or a check running: the run counts as working until
it exits, then as interrupted, and `discard` restores its allowed files from
the snapshot, keeping a copy. A worker or check counts while any process it
started does. Off Windows that is its process group. On Windows, where
dispatch's own children die with it but theirs don't (a check's shell, a
harness's `.cmd` shim), it is the processes descended from it, found by the
parent id they keep; dispatch lists them with PowerShell only once it is
gone. Start times tell a process from a later one that reused its id. Where
they can't be read (macOS; Windows when PowerShell can't list processes),
a process counts for at most six hours from its start, and on Windows an
unreadable list counts as still running, which the hint says.

A run's state is written aside and renamed into place, so a concurrent
`doctor`, `prune` or `discard` never reads it half-written.

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

Checks and workers run with pnpm's `verify-deps-before-run` off. pnpm 10+
installs before `pnpm run` when dependencies look stale, and in a worktree
they always do (its paths differ from the ones pnpm recorded): the install
wrote through the linked `node_modules` and repointed the repository's own
links at the worktree. A change to the install markers during the checks
still makes the run `out_of_scope`.

A check that changes a file git sees (a formatter that fixes, a generator)
makes the run `out_of_scope`, even when every check passed: the checks
verified the worker's version, which is what `apply` would install, and the
tree now holds another. In place, the worker's version is put back and the
checks' copies kept in the run's state. Ignored output (builds, caches) doesn't
count. Configure checks that only verify, such as `format:check`, not
`format`.

Worktrees get the project's venv linked. Its editable install still points at
the repository, so with a `src/` directory the checks (and the worker) get
`PYTHONPATH=src` to test the worktree's code.

## Trust boundary

Harness permissions limit what a worker can do while it runs: which files it
edits and which commands it runs. They don't sandbox the code it writes. The
checks run that code with your permissions and environment (minus the
secrets below), as your own test run would, and a worker in place edits your
real working tree; dispatch
restores out-of-scope files afterwards, it doesn't prevent writing them. Give
workers the same trust you give the models behind them, and keep untrusted
routes off repositories whose tests reach credentials or production systems.

## Secrets

Workers, and the checks dispatch runs on their code, get your environment
without the variables that look like credentials: names with a `TOKEN`,
`SECRET`, `PASSPHRASE`, `CREDENTIAL`, `KEY`, `PAT` or `AUTH` part
(`GITHUB_TOKEN`, `NPM_TOKEN`, `AWS_SECRET_ACCESS_KEY`), `PASSWORD` or `PASSWD`
anywhere in the name (`PGPASSWORD`), a `PWD` part after another
(`MYSQL_PWD`; `PWD` itself is the working directory), and URLs with a
password in them (`DATABASE_URL=postgres://user:pass@...`,
`REDIS_URL=redis://:pass@...`).

Each harness keeps what it logs in with: Claude Code `ANTHROPIC_*` and
`CLAUDE_CODE_OAUTH_TOKEN`, Codex `OPENAI_*` and `CODEX_*`, OpenCode the route
provider's own (`OPENROUTER_*` for `openrouter/...`; `GOOGLE_*` and
`GEMINI_*` for `google/...`). To pass more, list names (`NAME` or `PREFIX_*`)
in `passEnv` on a route (that worker only) or on a project (its workers and
its checks), for example a test suite that needs a token:

    "projects": { "C:/work/api/**": { "passEnv": ["STRIPE_TEST_KEY"] } }

## Known limitations

Where the skill has been run, and what to expect elsewhere.

**Platforms.** Every harness has been verified on Windows with real runs
(see the harness notes). Linux runs the test suite with a fake harness; real
harnesses there are not verified, in particular whether Codex's sandbox
refuses writes through a worktree's linked dependency folders, where agy
keeps its login (a worker's separate home may lose it), and whether a
harness starts processes outside its process group. macOS is untested.
Checks run through `cmd.exe` on Windows and `/bin/sh` elsewhere (`dash` on
Debian and Ubuntu), so configured checks need to suit that shell.

**Hosts.** The orchestrator has been Claude Code, and once OpenCode. Codex
and Antigravity, as desktop apps, have not.

- Only Claude Code is recognized as the orchestrator (through `CLAUDECODE`),
  so only its own models come back as `use_native`. Under another host, its
  models run as external workers on the same quota. An `orchestrators`
  entry in your config gives a host its quota pools; the host is picked by
  an environment variable it sets (`env`), or by `--orchestrator <name>` on
  each run.
- A builder takes up to 30 minutes plus its checks. The host must let a
  command run that long or in the background; a host that kills it leaves
  an interrupted run to `discard`.
- A host that sandboxes its commands, as Codex does, is expected to keep
  dispatch from writing its state under the home directory, starting
  processes with piped output (Codex's unelevated Windows sandbox refuses
  that), and reaching the network for its workers: run dispatch outside
  that sandbox.

**Behavior to know.**

- An editing worker in place shares your working tree: edits made there
  while it or its checks run count as its own.
- Checks must only verify: one that rewrites files makes every run
  `out_of_scope`.
- OpenCode loads plugins, so a repository's own OpenCode plugins run in
  its workers.
- Claude Code workers' sessions appear in your Claude Code session history.
- Not handled: renames that change only a file name's case on Windows, two
  rebriefs of one run, or two runs claiming the tree in place, racing each
  other, and validating a project's `packageManager` field.

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
