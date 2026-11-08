---
status: IMPLEMENTED
last_updated: 2026-11-08
scope: The root script names and what each guarantees, the shared tool configurations, and how dependency versions are declared.
---

# Workspace

This document is the workspace's contract: the names of the root scripts and what each one guarantees, the configuration files every project shares, and how versions are declared. CI, the git hooks, and the agent instructions rely on it. How this project implements the scripts, narrows a run, and adds a package is in [Tooling](tooling.md).

## Root scripts

| Script               | Guarantees                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`  | Every file is formatted: code, JSON and YAML by oxfmt, Markdown by Prettier. Reports, writes nothing.                                         |
| `pnpm format:fix`    | The same two formatters, rewriting files.                                                                                                     |
| `pnpm lint:check`    | oxlint passes over the repository, with warnings treated as errors.                                                                           |
| `pnpm lint:fix`      | oxlint, applying its safe fixes.                                                                                                              |
| `pnpm typecheck`     | Every package and the repository's own TypeScript type-check.                                                                                 |
| `pnpm test`          | Every package's and app's unit and integration suites pass.                                                                                   |
| `pnpm test:watch`    | The same, in watch mode.                                                                                                                      |
| `pnpm test:coverage` | The same, with a coverage report in `coverage/`.                                                                                              |
| `pnpm build`         | Every package that produces output builds, in dependency order.                                                                               |
| `pnpm verify`        | `format:check`, `lint:check`, `build`, `typecheck` and `test`, in that order, then any check the project adds, stopping at the first failure. |
| `pnpm prepare`       | Runs on install: points git at the committed hooks in `.githooks/`.                                                                           |

`pnpm verify` is what CI runs ([CI](ci.md)), so a green local `verify` predicts a green run. The order puts the cheapest checks first, so a formatting slip is reported in a second instead of after the tests. The build comes before type checking and tests because a package that imports another workspace package resolves it through that package's `exports`, which for a built package point at `dist/`: on a fresh clone, as in CI, a type check or a test run before the build cannot resolve the import and fails.

Keep these names as they are: CI, the git hooks and the agent instructions call them by name. A script that only some projects need, such as `dev` or an end-to-end suite, is the project's to add.

<!-- project:start -->

Every root script here is a thin wrapper around `hub`, and [Tooling](tooling.md#running-it) maps each one to its command. Beyond the scripts above:

| Script                    | Guarantees                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm test:browser`       | Every package's browser suite passes, after its Playwright browsers are installed.                       |
| `pnpm test:browser:watch` | One package's browser suite, in Playwright's UI mode.                                                    |
| `pnpm check`              | The repository's compliance checks pass: the package specifications `hub check` enforces.                |
| `pnpm generate`           | Every generated file is rewritten from its sources; `--dry-run` reports stale files and writes nothing.  |
| `pnpm format`             | The same as `format:check`, so the obvious name never reaches Windows' disk formatter.                   |
| `pnpm clean`              | Build output and caches are removed.                                                                     |
| `pnpm cloc`               | Lines of code are counted over the selected paths.                                                       |
| `pnpm packages`           | The workspace packages are listed.                                                                       |
| `pnpm status:npm`         | Each public package's version is compared with what npm has.                                             |
| `pnpm status:pack`        | Each public package's publishable contents are reported.                                                 |
| `pnpm hub`                | Runs any `hub` command, including the occasional ones with no script of their own, such as `hub labels`. |

`pnpm verify` runs `test:browser` and then `check` after `test`. Every script takes `hub`'s selectors, so `pnpm verify --changed` verifies a branch and `pnpm test error` one package; [Tooling](tooling.md#targets) describes them.

<!-- project:end -->

## Configuration

| File                  | Configures                                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`        | The root scripts, the tooling as `devDependencies`, and the pinned Node.js and pnpm (`engines`, `packageManager`).                                                                                                                                                        |
| `pnpm-workspace.yaml` | The workspace globs, the catalog of every dependency version, and the supply-chain rules for installs ([CI](ci.md#dependency-installs)).                                                                                                                                  |
| `.npmrc`              | `engine-strict`, so an install outside `engines` fails.                                                                                                                                                                                                                   |
| `.nvmrc`              | The exact Node.js version, read by `nvm` and by CI.                                                                                                                                                                                                                       |
| `.editorconfig`       | Indentation, final newline, LF line endings, and no hard wrap in Markdown.                                                                                                                                                                                                |
| `.gitattributes`      | LF line endings in the repository and the working tree on every platform, and the binary file types.                                                                                                                                                                      |
| `.oxfmtrc.json`       | oxfmt: 120 columns, double quotes, semicolons, trailing commas, sorted imports and `package.json` keys. Markdown is excluded; Prettier owns it. Nothing else is listed: oxfmt already skips what `.gitignore` and `.prettierignore` list, and the lockfile.               |
| `.prettierrc.json5`   | Prettier, for Markdown only: `proseWrap: "never"`, so a paragraph is one line and a diff shows the sentence that changed.                                                                                                                                                 |
| `.prettierignore`     | Paths inside the Markdown set Prettier leaves alone: build output and caches.                                                                                                                                                                                             |
| `.oxlintrc.json`      | oxlint's plugins and rules. `no-console` allows `console.warn` and `console.error`, a library's deliberate diagnostics, and refuses the rest, such as a forgotten `console.log`, except in `.githooks/`, any `scripts/` directory and tests, where printing is the point. |

The TypeScript and Vitest configurations depend on how the project runs its checks; [Tooling](tooling.md) describes them.

<!-- project:start -->

| File                  | Configures                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tsconfig.json`       | The TypeScript configuration of the repository's own files; [Tooling](tooling.md#type-checking) describes how packages type-check.                                                               |
| `.oxlintrc.json`      | Also allows `console` in the skills CLI, benchmarks, and test support, whose output is the point, and ignores the skills' eval fixtures.                                                         |
| `.oxfmtrc.json`       | Also sorts Tailwind CSS classes.                                                                                                                                                                 |
| `.prettierrc.json5`   | Also turns off `embeddedLanguageFormatting` for generated API reference pages and agent skills, so a signature block stays what the compiler emitted and a fenced example keeps its line breaks. |
| `.prettierignore`     | Also keeps the vendored icon attributions in `packages/icons/data/` and the skills' eval fixtures as received.                                                                                   |
| `.gitattributes`      | Also keeps the skills' CSV eval fixtures byte-for-byte, line endings included.                                                                                                                   |
| `patches/`            | pnpm patches for dependencies, each named by `patchedDependencies` in `pnpm-workspace.yaml` with the reason and the condition for removing it.                                                   |
| `.github/labels.json` | The fixed issue label groups; `pnpm hub labels` adds a `pkg:` and `app:` label per package and app.                                                                                              |

<!-- project:end -->

### Two formatters

oxfmt formats everything it understands except Markdown; Prettier formats only Markdown. oxfmt is far faster and agrees with Prettier's output for code, but its Markdown support does not yet match Prettier's, and the documentation is where formatting churn costs the most review time. `.oxfmtrc.json` ignores `**/*.md`, and the scripts hand Prettier `**/*.md` explicitly, so neither formatter touches the other's files.

### Versions

Every dependency version is declared once, in the catalog in `pnpm-workspace.yaml`, and referred to as `catalog:` in each `package.json`. The workspace therefore cannot hold two versions of one dependency by accident, and an upgrade is a one-line change that Dependabot can propose ([CI](ci.md#dependency-updates)).

## Git hooks

[Contributing](../CONTRIBUTING.md#hooks) lists what each hook checks. This section records why each does that much and no more.

`pre-commit` formats and lints the staged files, fixes what it can, and re-stages the result. It runs those checks and no others: type checking and tests take minutes, and a hook that slow gets bypassed until it may as well not exist. `pnpm verify` is where the rest belongs.

`pre-commit` reads files from the working tree rather than from the index. For a file that is only partly staged that matters: the hook never rewrites it, because re-staging would sweep in the parts deliberately left out of the commit, and it checks the file as it sits on disk. A commit whose staged content is already clean can therefore still fail. The alternative, skipping such files, would let unformatted code through the one check meant to stop it.

`commit-msg` checks the subject line and nothing else. A body is optional, and no hook can tell whether a message describes the commit honestly, so the mechanical half is automated and the rest stays with review. Merges, reverts, and `fixup!`, `squash!`, and `amend!` markers pass unchecked: git composes those subjects, and rejecting a message nobody wrote would only train people to reach for `--no-verify` out of habit, which costs the checks that do matter. The 72-character limit is where practice already sat rather than a number from a style guide: replayed over 200 earlier commits of codenhub/codenhub, it rejected six, three merely long and three joining two changes with "and", which is the split the convention asks for anyway.

The hooks are wired by `core.hooksPath`, which the root `prepare` script sets on every install. That is a local git setting rather than a tracked one, so a fresh clone runs no hooks until something sets it; doing it from `prepare` keeps a hook manager out of the dependency list. The setup step never fails an install: a tree without git, or without permission to write its config, reports and carries on.

`pre-push` reads the destination ref rather than the branch you are standing on, so its refusal to push to `main` holds for a push from `main`, for an explicit refspec that targets it from elsewhere, and for a `--delete`. It also refuses a branch whose name is not `<type>/<slug>`. That check sits in a hook rather than in wording alone because the name is often not a choice anyone made: an agent harness creates `claude/...` or `codex/...` before the agent has read a file, and a rule about naming a branch does not read as applying to a branch that already has a name. Deleting a remote branch passes whatever it is called, since removing a misnamed branch is the cleanup, and tags are not checked.

`--no-verify` bypasses these: on `git commit` for the first two, on `git push` for the last. It is for the change that genuinely has to land unfixed, and it is worth saying out loud when it is used, since the whole point of a hook is that skipping one is visible.
