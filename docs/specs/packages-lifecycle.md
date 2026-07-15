---
status: APPROVED
last_updated: 2026-07-15
scope: Workspace packages under `packages/*`.
---

# Package lifecycle spec

This document defines how packages are structured, built, tested, exported, and prepared for publishing.

## Compliance

Every `private: false` package under `packages/*` MUST follow this spec.

Private packages and apps MAY follow this spec when useful. They are not required to comply unless another document says so.

## Package metadata

Public package `package.json` files MUST include:

- `name`: published package name.
- `private`: `false`.
- `version`: package version.
- `type`: `module`.
- `files`: only publishable output and consumer documentation, normally `dist`,
  public `docs/`, `llms.txt`, and `llms-full.txt`.
- `main`: ESM entrypoint for compatibility with older tooling.
- `module`: ESM entrypoint.
- `types`: TypeScript declaration entrypoint.
- `exports`: explicit public exports.
- `scripts`: package lifecycle scripts.
- `publishConfig.access`: `public`.

Public package metadata SHOULD include `description`, `license`, and repository links when package publishing is ready.

## Required scripts

Public packages MUST define:

- `build`: produces publishable output.
- `typecheck`: runs TypeScript without emitting.
- `test`: runs tests once.
- `test:watch`: runs tests in watch mode.
- `prepublishOnly`: runs at least `pnpm build && pnpm typecheck`.
- `status:npm`: checks published registry metadata, dist tags, and access status for the package.
- `status:pack`: checks publishable package contents with `npm pack --dry-run`.

Packages MAY omit `test` and `test:watch` only when they contain no executable code and the exception is documented.

Root workspace scripts MUST keep supporting:

- `pnpm build`
- `pnpm format:check`
- `pnpm format:fix`
- `pnpm lint:check`
- `pnpm lint:fix`
- `pnpm status:npm`
- `pnpm status:pack`
- `pnpm test`
- `pnpm typecheck`

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

Every supported import path MUST be listed in `exports`. Default consumer usage
MUST be introduced in the package README, and every import path MUST be covered
by published package docs according to
`docs/specs/packages-documentation.md`.

Packages MUST NOT rely on consumers importing private files from `dist` or `src`.

Subpath exports SHOULD be stable and intentional. Do not add subpaths for internal organization only.

CSS or asset exports MUST be listed explicitly when consumers import them directly.

## Dependencies

Use `dependencies` for packages required at runtime.

Use `peerDependencies` when the consumer must provide the dependency, such as framework, bundler, or host runtime integrations.

Use `devDependencies` for build, test, lint, type, and local-only dependencies.

Workspace-internal dependencies SHOULD use `workspace:*`.

Do not add dependencies for simple logic that can be maintained in-house.

## Publishing

Before publishing a public package, run:

- `pnpm format:check`
- `pnpm lint:check`
- `pnpm typecheck`
- `pnpm test`
- Package `prepublishOnly`
- Package `status:pack`

After publishing a public package, run package `status:npm` to confirm the registry version, dist tags, and package access status. If `npm view` is temporarily unavailable immediately after publish but `npm dist-tag ls` and `npm access get status` succeed, wait for registry metadata propagation and retry before announcing consumer readiness.

Published packages MUST NOT include secrets, local paths, internal docs, test
fixtures that are not useful to consumers, or build artifacts outside `files`.

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

README examples and public reference docs MUST match `package.json` `exports`.
When `exports` changes, source JSDoc/TSDoc, README content, public docs, and LLM
files MUST be reviewed in the same change.

Package pack checks MUST confirm that the README, public `docs/`, `llms.txt`, and
`llms-full.txt` are included and `docs/internal/` is excluded.

## Exceptions

Exceptions MUST follow `docs/docs-guidelines.md` and be recorded in
`docs/specs/packages-exceptions.md`.

A valid lifecycle exception MUST name the package, the skipped rule, and why the package remains safe to build, test, or publish.
