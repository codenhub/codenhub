---
status: APPROVED
last_updated: 2026-07-18
scope: Optional workspace package development and consumer-debug workflows.
---

# Package development spec

This document defines the preferred workflow for fast package development and pre-ship confidence when automated tests alone do not make real usage easy enough to exercise.

## Applicability

This workflow is optional by default. Packages do not need `playground`, `dev`, or `debug` folders just to comply with repository structure.

Missing this workflow is non-compliant only when the package directly suffers from not having it and adding it would immediately remove recurring development or debugging pain.

Use this workflow when a package needs one or more of these:

- Fast iteration against realistic usage while developing package behavior.
- Manual or exploratory debugging with real package imports.
- Pre-ship confidence that public imports and bundled output behave like consumer code expects.
- Separate local environments for different runtimes or dependency sets.

## Directory Roles

Use these directories only when they help the package:

```text
packages/example/
  playground/
  dev/package.json
  debug/package.json
  debug/node/package.json
  debug/cf/package.json
```

- `playground`: Shared real-usage scenario source. This is leaf code, not a workspace package. It imports the package like a consumer, for example `import { createStore } from "@codenhub/store";`, then runs realistic use cases.
- `dev`: Private workspace package or app that runs playground scenarios against live package source from `src/` for fast iteration.
- `debug`: Private workspace package or app that runs playground scenarios through package public exports and built output before shipping.
- `tests`: Automated unit, integration, end-to-end, and visual tests. Follow `docs/specs/tests.md` for automated test placement and execution.

`dev` and `debug` may be one level deeper when dependency sets or runtimes need separation, such as `packages/example/debug/node/package.json` and `packages/example/debug/cf/package.json`.

## Scenario Code

Keep reusable real-usage code in `playground` so `dev` and `debug` exercise the same behavior. Avoid copying the same scenario into both environments.

Playground code should use public package imports, not private source or output paths:

```ts
import { createStore } from "@codenhub/store";

const preferences = createStore({
  storageKey: "preferences",
  initialState: { theme: "system" },
});
```

Environment-specific setup belongs in `dev` or `debug`. The scenario should stay focused on the consumer use case.

## Source Resolution

`dev` MUST run the package against live source code. It may use aliases, runtime loaders, or bundler configuration so public imports resolve to `src/` entrypoints. It should not depend on stale `dist` output.

`debug` MUST NOT resolve the package under inspection to source files. It should use the same public imports as consumer code and run against the package exports and built output.

Until every relevant package is published or external package installs are practical, `debug` MAY depend on the package under inspection with `workspace:*`. This is acceptable only when `debug` still resolves through package public exports and built output. Build the package before running `debug` when its exports point to `dist`.

## Workspace Matching

Repository workspace globs include package-local `dev` and `debug` environments at these depths:

```text
packages/*/{dev,debug}/package.json
packages/*/{dev,debug}/*/package.json
packages/plugins/**
```

`playground` is intentionally not matched as a workspace package.

## Relationship To Automated Tests

This workflow does not replace automated tests. Put automated unit tests next to the source they verify, or use package-local `tests/` directories for integration, end-to-end, visual, or separated unit tests when colocation is worse.

Do not move automated tests into `playground`, `dev`, or `debug` only because they exercise real usage. If a scenario becomes deterministic and valuable as a gate, promote it into the package's automated test structure.
