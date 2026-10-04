---
status: APPROVED
last_updated: 2026-10-04
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

## Node.js support

A public package that runs on Node.js, whether as a library, a CLI, or a build-time plugin, MUST declare `engines.node` as `>=<major>`, where `<major>` is the Node.js major line pinned in `.nvmrc`, today `>=24`. Its README `Requirements` section and public docs MUST state the same floor. Packages run on Node.js 24 or newer for the same reason the repository's own toolchain does: it is the only version CI runs.

- **Floor tracks what CI tests.** CI runs the pinned version and nothing else (`docs/ci.md`, "Toolchain"), so the pinned major is the only line a floor can name and still be tested. A floor below it is a claim no run checks. Before this rule, four packages declared `>=22` and their READMEs repeated it, but no CI run had ever used Node.js 22.
- **The major, not the patch.** The floor names the line, `>=24`, not the pinned patch, `>=24.14.1`. The patch is a toolchain choice, not something a package needs, so naming it would turn away consumers on earlier 24.x releases for no reason. The cost is that CI tests one patch of the line, not its first.
- **A higher floor needs a reason.** A package MAY declare a higher floor when it needs an API the pinned major lacks. It MUST name that API next to the floor in its README `Requirements`, so the next person can tell when the reason no longer applies.
- **No upper bound.** Packages declare no `<25`. CI does not test a newer major either, but blocking an install on one would only break a consumer whose code most likely works. The repository root keeps its upper bound, because the root bound guards the toolchain, not a consumer.
- **Browser-only packages declare nothing.** A package that runs only in a browser, worker, or edge runtime MUST NOT declare `engines.node`. Its unit tests run under Node.js, but that is test infrastructure, not a promise to consumers. A package that runs on Node.js as well as in browsers, such as `@codenhub/validation`, falls under the rule above.

`hub check` enforces the floor's range, its distance from the pin, and the README and public docs that state it (`docs/tooling.md`, "Compliance checks"). Whether a package runs on Node.js, and the reason for a higher floor, remain review responsibilities.

Narrowing `engines` is a breaking change, so the pinned major moves deliberately. A change that moves `.nvmrc` to a new major MUST either raise every floor with it, which makes each affected package's next release breaking, or add a CI job that keeps testing the old floor until those packages raise theirs.

Rejected alternative: the oldest maintained Node.js LTS as the floor (22 until its end of life in April 2027), with a CI job that reads each package's `engines` and runs a changed package's unit tests on its floor. It would have kept Node.js 22 consumers six months longer. In exchange it added a second runtime to the runs of every changed package, plus scoping logic to skip the others, and the job's work would disappear when 22 reached end of life. A trial of that job in [#202](https://github.com/codenhub/codenhub/pull/202) passed on 22, so the cost was not breakage, only CI weight for a short window. Decided in [#203](https://github.com/codenhub/codenhub/issues/203).

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

`docs/specs/packages-development.md` defines the optional `playground`, `dev`, and `debug` workflow for package-local real-usage scenarios.

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

### Inlined dependencies

A package MAY inline a dependency into its own build output instead of asking every consumer to install it. That is how a package depends on a small library without passing that library's version to its consumers, and without their bundles carrying anything the package does not use. The package declares the library in `devDependencies` and lists its name in `codenhub.bundled` in `package.json`:

```json
{
  "devDependencies": { "@codenhub/validation": "catalog:" },
  "codenhub": { "bundled": ["@codenhub/validation"] }
}
```

`codenhub.bundled` is an array of package names, and every name MUST be a `devDependencies` entry. A listed name is exempt from the rule above that published code imports only `dependencies` and `peerDependencies`, because a consumer receives the library's code inside the package. The list is a promise about the build, so it comes with three requirements:

- The build MUST inline both the library's JavaScript and its types. Neither the built JavaScript nor the built declarations may name it, or a consumer's install is missing it. `hub check` reads the built output when `dist/` exists and reports a listed name that is still there.
- A listed name MUST be imported by the package's source. A name nothing imports is a stale entry.
- A library that is loaded lazily, or that must stay a single copy across the consumer's tree because it holds global state or identity, such as a framework, is a `dependency` or a `peerDependency`, not an inlined one.

Three cases the check cannot settle, which reviewers MUST watch for:

- **Type-only imports.** The check ignores them for the runtime question, because a build erases them. It cannot see the other half: an erased import still reaches a consumer when the emitted `.d.ts` refers to the package. If a published type names a package, that package is a `dependency` or a `peerDependency` even though no JavaScript imports it. A package listed in `codenhub.bundled` is the exception, and its declarations are checked as described above.
- **Dependencies selected by configuration.** A tool named by an option rather than by an import — a test environment, a coverage provider — is invisible to import analysis. The check treats a name appearing anywhere in the package as used and never reports it, which is the safe direction.
- **Dynamic and computed specifiers.** A specifier assembled from a variable names no package the check can read. Declare whatever such code loads.

### Ranges

A public package that depends on another public package SHOULD install it from its release, through a `catalog:` range, not from the working tree. It is then built and tested against the same code its consumers install, so a defect in the dependency shows up the way a consumer meets it, and no build order or cycle ties the two together. The cost is accepted on purpose: a change that needs new behavior from another package waits for that package to release it, rather than landing on code no consumer has yet. pnpm installs a `catalog:` range from the registry even when the workspace holds a matching version, and `pnpm-workspace.yaml` sets `linkWorkspacePackages: false` so that stays true if pnpm's default changes.

The catalog entry for a workspace package SHOULD be `^<version>`, naming that package's latest stable release tag. A release lands after the merge that prepared it, so `main` trails each release until a pull request raises the entry; `hub check` reports the gap as a warning rather than an error so it never fails unrelated pull requests in the meantime.

Every other workspace-internal dependency SHOULD use `workspace:*`: one where either side is private, such as `@codenhub/tools`, `@codenhub/app-shell`, an app, or a `dev`, `debug`, or `demo` package. A private package has no release to install, and those environments exist to run the working tree.

An external dependency that two or more workspace packages install MUST use `catalog:`. Sharing is what the catalog is for: a dependency declared twice can drift to two versions, and two majors of the same library in one install tree is a failure no other check would catch. A dependency only one package installs MAY pin its own range, because it has no second declaration to drift from.

`peerDependencies` are exempt from all of these rules. A peer range is a contract with the consumer, and a `workspace:` or `catalog:` range would publish it pinned.

Workspace dependencies MUST NOT form a cycle. A cycle has no valid build order, so the tooling falls back to the declaration order and builds something before its own dependency.

Do not add dependencies for simple logic that can be maintained in-house.

## Publishing

Before publishing a public package, run `pnpm hub release <package>`. It runs `pnpm verify` and then reports the preconditions a build and a test run cannot answer:

- **version**: the local version is newer than the one already on the registry, or the package has never been published.
- **worktree**: the package has no uncommitted changes, so the tarball matches a commit.
- **tarball**: `npm pack --dry-run` includes every file `exports`, `main`, `module`, and `types` point at.

The command writes nothing and publishes nothing. It is the report a maintainer reads while deciding whether to release.

### Who publishes

Publishing is irreversible in a way no other repository action is: a version can be deprecated but never replaced. A release is therefore authorized by a person and performed by CI, and the two halves MUST stay separate.

A maintainer authorizes a release by pushing a tag named `<package name>@<version>`, such as `@codenhub/error@0.3.0`. That tag MUST name a version equal to the one in the package manifest at the tagged commit. `.github/workflows/publish.yml` runs on such a tag and publishes through `hub publish`, which refuses the run when the two disagree; `docs/ci.md` describes the workflow and `docs/tooling.md` the command.

Publishing MUST NOT happen on merge. A merge is a decision to change `main`, not a decision to release, and the two must be separately revocable — a version bump that lands in a pull request has to be reversible by a revert, which it is not once a merge publishes it.

CI MUST authenticate through npm trusted publishing, exchanging the workflow's OIDC token for a short-lived credential. No long-lived npm token may exist in this repository or in its Actions secrets. Provenance follows from that exchange rather than from a flag.

A maintainer MAY run `hub publish <package>` from their own machine against their own `npm login`, and MUST do so for a package's first release: a trusted publisher cannot be configured on npm for a package name that does not exist yet. Every release after the first goes through the workflow.

Every version on npm MUST have its release tag in the repository. The tag is how the repository tells a released package from an unreleased one — the documentation site publishes a package only from its latest tag, and not at all without one — so a version published without a tag is invisible to everything that reads them. A manual publish therefore tags first: `hub publish <package>` refuses to run unless `<package name>@<version>` names the commit being published, and the maintainer pushes the tag once npm has the version. The workflow then runs on that tag and, finding the version already on npm, succeeds without publishing, which records the release the same way a workflow publish would.

A pre-release version — one carrying a SemVer suffix such as `-beta.1` — MUST publish under the `next` dist-tag, not `latest`, so that `npm install` without a version keeps resolving the current stable release. `hub publish` derives this from the version and needs no extra flag. The documentation site follows the same split and keeps showing the newest stable release (`docs/ci.md`, "Publish-scoped content").

Package `prepublishOnly` still runs the build and typecheck that npm requires at publish time.

The published manifest MUST NOT carry a `workspace:` or `catalog:` range. Both are pnpm protocols that npm cannot install, and `npm publish` run on a package directory ships them verbatim. `hub publish` therefore packs with `pnpm pack`, which replaces them with the versions they resolve to, and hands npm the tarball. Publishing a tarball runs none of its lifecycle scripts, so `hub publish` runs the package `prepublishOnly` itself first.

After publishing, confirm the registry version, dist tags, and package access status. `hub publish` reads the served version back and reports it; package `status:npm` reports all three. If `npm view` is temporarily unavailable immediately after publish but `npm dist-tag ls` and `npm access get status` succeed, wait for registry metadata propagation and retry before announcing consumer readiness. The same wait applies while npm's automated review holds a new version, which the package's versions page on npmjs.com shows as "Validating"; the version is published but not yet installable.

Published packages MUST NOT include secrets, local paths, internal docs, test fixtures that are not useful to consumers, or build artifacts outside `files`.

Packages SHOULD publish only files needed by consumers.

## Versioning

Version changes SHOULD follow semantic versioning:

- Patch: bug fixes with no API or behavior break.
- Minor: new backward-compatible functionality.
- Major: breaking API, behavior, runtime, export, or dependency changes.

Breaking changes MUST update the package README and any relevant `docs/` files in the same change.

Pre-1.0 packages may move faster, but breaking changes MUST still be documented.

Packages are also encouraged to track release history following `docs/specs/packages-changelog.md`; it's recommended, not required, and does not replace the README and `docs/` updates required above. A package that has opted in MUST keep its changelog in step with its version, which `hub check` enforces.

`hub release --cut=<version|major|minor|patch>` raises the version and scaffolds that entry in one step, and prints the sequence that follows. It writes only; committing and tagging stay with a person, for the reason "Who publishes" gives above.

## Documentation relationship

`docs/specs/packages-readme.md` defines package README requirements.

`docs/specs/packages-documentation.md` defines package documentation requirements.

Private packages intended to expose public documentation MUST opt in through `codenhub.docs` and follow the same documentation spec. Opting in makes documentation eligible for the site; it does not publish it. The production documentation site publishes a package only from its latest release tag (`docs/ci.md`, "Publish-scoped content"), and a private package is never released, so an opted-in private package's documentation is held to the documentation spec and served by `astro dev`, but never reaches the production site.

README examples and public reference docs MUST match `package.json` `exports`. When `exports` changes, source JSDoc/TSDoc, README content, public docs, and LLM files MUST be reviewed in the same change.

Package pack checks MUST confirm that the README, public `docs/`, `llms.txt`, and `llms-full.txt` are included and `docs/internal/` is excluded.

## Exceptions

`docs/guidelines/documentation.md` defines exception requirements; `docs/specs/packages-exceptions.md` owns package-specific exceptions and compliance-check waivers.

A valid lifecycle exception MUST name the package, the skipped rule, and why the package remains safe to build, test, or publish.
