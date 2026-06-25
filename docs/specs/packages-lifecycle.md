# Package lifecycle spec

**Status:** APPROVED
**Last updated:** 2026-06-10
**Scope:** Workspace packages under `packages/*`.

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
- `files`: only publishable output, normally `dist`.
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

## Exports

Public packages MUST use explicit `exports`.

Every supported import path MUST be listed in `exports`. Import paths that are part of default or common consumer usage MUST be documented in the package README. Advanced or uncommon import paths MAY be documented in package-level `docs/` files when README coverage would make the README noisy or harder to scan.

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

Published packages MUST NOT include secrets, local paths, test fixtures that are not useful to consumers, or build artifacts outside `files`.

Packages SHOULD publish only files needed by consumers.

## Versioning

Version changes SHOULD follow semantic versioning:

- Patch: bug fixes with no API or behavior break.
- Minor: new backward-compatible functionality.
- Major: breaking API, behavior, runtime, export, or dependency changes.

Breaking changes MUST update the package README and any relevant `docs/` files in the same change.

Pre-1.0 packages may move faster, but breaking changes MUST still be documented.

## README relationship

Package README files MUST follow `docs/specs/packages-readme.md`.

README exports and examples MUST match `package.json` `exports` for the public import paths they document.

When `exports` changes, README import examples and API/reference sections MUST be reviewed in the same change.

## Exceptions

Exceptions MUST follow `docs/docs-guidelines.md`.

A valid lifecycle exception MUST name the package, the skipped rule, and why the package remains safe to build, test, or publish.
