---
status: APPROVED
last_updated: 2026-08-12
scope: Public workspace packages.
---

# Package lifecycle spec

This document defines how packages are structured, built, tested, exported, and prepared for publishing.

## Compliance

Every `private: false` workspace package MUST follow this spec. A package's location within the workspace does not change these requirements.

`pnpm check` enforces the mechanically checkable parts of this spec, as defined by `docs/tooling.md`. A finding is waived only by a `Checks bypassed` bullet in `docs/specs/packages-exceptions.md`.

Private packages and apps MAY follow this spec when useful. They are not required to comply unless another document says so.

## Package metadata

Public package `package.json` files MUST include:

- `name`: published package name.
- `private`: `false`.
- `version`: package version.
- `type`: `module`.
- `files`: only publishable output and consumer documentation, normally `dist`, public `docs/`, `llms.txt`, and `llms-full.txt`.
- `main`: ESM entrypoint for compatibility with older tooling.
- `module`: ESM entrypoint.
- `types`: TypeScript declaration entrypoint.
- `exports`: explicit public exports.
- `scripts`: package lifecycle scripts.
- `publishConfig.access`: `public`.
- `codenhub.docs`: public documentation eligibility, status, and optional presentation metadata as defined by `docs/specs/packages-documentation.md`.

Public package metadata SHOULD include `description`, `license`, and repository links when package publishing is ready.

Public packages SHOULD also ship a `LICENSE` file at the package root, carrying the terms the `license` field names. The field states the terms; the file is what a consumer receives, and npm packs it whether or not `files` lists it. The repository root ships the same file for the repository itself.

## Required scripts

Public packages MUST define:

- `build`: produces publishable output.
- `typecheck`: runs TypeScript without emitting, as `tsc -b`. The package `tsconfig.json` MUST set `composite` and `noEmit`, which is what lets root tooling check several packages in one compiler process and skip the ones whose inputs have not changed. A package that needs a step of its own before the compiler MAY use a different script and is then checked on its own.
- `test`: runs unit and integration tests once, and nothing that needs a browser.
- `test:coverage`: runs those tests once and outputs a coverage report, as required by `docs/specs/tests.md`.
- `test:watch`: runs those tests in watch mode.
- `prepublishOnly`: runs at least `pnpm build && pnpm typecheck`.
- `status:npm`: checks published registry metadata, dist tags, and access status for the package.
- `status:pack`: checks publishable package contents with `npm pack --dry-run --ignore-scripts`. Ignoring scripts is required so the dry run does not trigger `prepublishOnly` and build the package a second time.

Packages with a browser suite MUST also define `test:browser`, and SHOULD define `test:browser:watch`, as required by `docs/specs/tests.md`. Those scripts run Playwright directly and MUST NOT install browsers; `hub test:browser` does that first, as defined by `docs/tooling.md`.

Packages MAY omit `test`, `test:coverage`, and `test:watch` only when they contain no executable code and the exception is documented.

Package scripts MUST invoke their own tool directly and MUST NOT chain a build step into `test`, `test:browser`, `test:browser:watch`, `test:coverage`, `test:watch`, `typecheck`, or `status:pack`. Root tooling runs the build first, as defined by `docs/tooling.md`; chaining it again would build twice. `prepublishOnly` is exempt because npm runs it outside that tooling and it MUST remain self-contained.

Root workspace scripts MUST keep supporting:

- `pnpm build`
- `pnpm check`
- `pnpm format:check`
- `pnpm format:fix`
- `pnpm generate`
- `pnpm lint:check`
- `pnpm lint:fix`
- `pnpm status:npm`
- `pnpm status:pack`
- `pnpm test`
- `pnpm test:browser`
- `pnpm test:coverage`
- `pnpm test:watch`
- `pnpm typecheck`

Each of those MUST also accept an optional target selecting a package, workspace directory, path, or glob.

## Build output

Packages MUST build into `dist` unless there is a documented reason to use another output directory.

TypeScript packages MUST emit declaration files for public exports.

Packages SHOULD publish source maps only when they are useful to consumers and do not expose private implementation details.

Generated output MUST NOT be treated as source of truth. Source, docs, and tests own behavior.

## Development workflow

Packages that need package-local real-usage scenarios SHOULD follow `docs/specs/packages-development.md` for the optional `playground`, `dev`, and `debug` workflow.

This workflow is not required for every package. Missing it is non-compliant only when the package directly suffers from not having it and adding it would immediately remove recurring development or debugging pain.

## Exports

Public packages MUST use explicit `exports`.

Every supported import path MUST be listed in `exports`. Default consumer usage MUST be introduced in the package README, and every import path MUST be covered by published package docs according to `docs/specs/packages-documentation.md`.

Packages MUST NOT rely on consumers importing private files from `dist` or `src`.

Subpath exports SHOULD be stable and intentional. Do not add subpaths for internal organization only.

CSS or asset exports MUST be listed explicitly when consumers import them directly.

## Dependencies

### Choosing the field

One question decides the field: **does a consumer who installs this package need the dependency?**

- `dependencies`: yes, and this package should bring it. Anything reachable from a published entry point belongs here.
- `peerDependencies`: yes, but the consumer must supply it, so that one copy is shared. Framework, bundler, and host-runtime integrations belong here.
- `devDependencies`: no. Build, test, lint, type, and local-only dependencies belong here, along with everything a playground, `dev`, or `debug` environment needs.

`hub check` decides the "reachable from a published entry point" part mechanically. It resolves each `exports`, `main`, `module`, and `bin` target back to its source file, follows the relative imports from there, and requires every external package it arrives at to be a `dependency` or a `peerDependency`. A file that no entry point reaches — a test helper living beside the source, for instance — is not published, whatever directory it sits in.

Three cases the check cannot settle, which reviewers MUST watch for:

- **Type-only imports.** The check ignores them for the runtime question, because a build erases them. It cannot see the other half: an erased import still reaches a consumer when the emitted `.d.ts` refers to the package. If a published type names a package, that package is a `dependency` or a `peerDependency` even though no JavaScript imports it.
- **Dependencies selected by configuration.** A tool named by an option rather than by an import — a test environment, a coverage provider — is invisible to import analysis. The check treats a name appearing anywhere in the package as used and never reports it, which is the safe direction.
- **Dynamic and computed specifiers.** A specifier assembled from a variable names no package the check can read. Declare whatever such code loads.

### Ranges

Workspace-internal dependencies SHOULD use `workspace:*`.

An external dependency that two or more workspace packages install MUST use `catalog:`. Sharing is what the catalog is for: a dependency declared twice can drift to two versions, and two majors of the same library in one install tree is a failure no other check would catch. A dependency only one package installs MAY pin its own range, because it has no second declaration to drift from.

`peerDependencies` are exempt from both rules. A peer range is a contract with the consumer, and a `workspace:` or `catalog:` range would publish it pinned.

Workspace dependencies MUST NOT form a cycle. A cycle has no valid build order, so the tooling falls back to the declaration order and builds something before its own dependency.

Do not add dependencies for simple logic that can be maintained in-house.

## Publishing

Before publishing a public package, run `pnpm hub release <package>`. It runs `pnpm verify` and then reports the preconditions a build and a test run cannot answer:

- **version**: the local version is newer than the one already on the registry, or the package has never been published.
- **worktree**: the package has no uncommitted changes, so the tarball matches a commit.
- **tarball**: `npm pack --dry-run` includes every file `exports`, `main`, `module`, and `types` point at.

The command writes nothing and publishes nothing. Publishing is irreversible in a way no other repository action is — a version can be deprecated but never replaced — so the tooling stops at the report and leaves `npm publish` to a person. Package `prepublishOnly` still runs the build and typecheck that npm requires at publish time.

After publishing a public package, run package `status:npm` to confirm the registry version, dist tags, and package access status. If `npm view` is temporarily unavailable immediately after publish but `npm dist-tag ls` and `npm access get status` succeed, wait for registry metadata propagation and retry before announcing consumer readiness.

Published packages MUST NOT include secrets, local paths, internal docs, test fixtures that are not useful to consumers, or build artifacts outside `files`.

Packages SHOULD publish only files needed by consumers.

## Versioning

Version changes SHOULD follow semantic versioning:

- Patch: bug fixes with no API or behavior break.
- Minor: new backward-compatible functionality.
- Major: breaking API, behavior, runtime, export, or dependency changes.

Breaking changes MUST update the package README and any relevant `docs/` files in the same change.

Pre-1.0 packages may move faster, but breaking changes MUST still be documented.

## Documentation relationship

Package README files MUST follow `docs/specs/packages-readme.md`.

Package documentation MUST follow `docs/specs/packages-documentation.md`.

Private packages intended to expose public documentation MUST opt in through `codenhub.docs` and follow the same documentation spec. Publication status and documentation eligibility are separate concerns: a package does not need to be published to provide public documentation.

README examples and public reference docs MUST match `package.json` `exports`. When `exports` changes, source JSDoc/TSDoc, README content, public docs, and LLM files MUST be reviewed in the same change.

Package pack checks MUST confirm that the README, public `docs/`, `llms.txt`, and `llms-full.txt` are included and `docs/internal/` is excluded.

## Exceptions

Exceptions MUST follow `docs/docs-guidelines.md` and be recorded in `docs/specs/packages-exceptions.md`.

A valid lifecycle exception MUST name the package, the skipped rule, and why the package remains safe to build, test, or publish.
