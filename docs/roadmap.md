---
status: APPROVED
last_updated: 2026-09-15
scope: repo-wide direction for the workspace's packages and deploy surfaces
---

# Roadmap

## Purpose

Durable direction for the workspace: what is being worked on now, what is intended, and what has been ruled out. Per-package release conditions and deferred work live in each package's `docs/internal/roadmap.md`; this file stays at the level of the whole repository.

## Current Focus

- **Per-package landing pages.** Public surface stabilization is otherwise done: `apps/www`'s package list is the canonical entry point at `codenhub.dev`, `@codenhub/app-shell` gives the three deploy surfaces identical chrome, and `apps/docs` / `apps/demo` have slimmed their landing pages to a searchable list. What is left is a landing page per package at `codenhub.dev`, closer to a commercial page than a docs page, making the case for why a consumer should reach for it.
- **`apps/docs` polish.** UI/UX and code cleanup, and the navigation rework: a clearer scheme for what individual sidebar entries are named, per-symbol reference anchors, search weighting, and the deck treatment (`description` / `since`) for hand-authored pages. The Guides / Reference / Changelog tab strip has landed; deeper sidebar nesting was weighed and rejected.
- **Generated API reference rollout.** The generator, the `reference` check, and the `codenhub.docs.reference` opt-in are proven on `@codenhub/error`. Next: opt in packages with different shapes (`icons`, `kbd`, `router`, `validation`) to find where generated signatures and prose fall short, then flip to default-on with a `codenhub.docs.reference: false` opt-out.

## Planned

- **Repository governance.** `SECURITY.md` is the one with a real trigger: provenance-attested packages invite an audit and this repository answers nowhere for a report. `CODEOWNERS` and a pull-request template pay off once more than one person reviews here.
- **Backfill package demos.** `apps/demo` aggregates `packages/*/demo/`, and only `icons` and `styles` have one, so the deployed surface shows two of thirteen public packages.
- **Bootstrap the unpublished packages.** `components`, `i18n`, `kbd`, `toaster`, `tauri-plugin-webview`, and `tauri-plugin-window` have never been published; each needs one manual `hub publish` from a maintainer's machine before its trusted publisher can be configured on npm.
- **Documentation MCP server.**
- **Documentation versioning, then localization.** Keep docs for past package versions, then localize with `@codenhub/i18n`. Both thread a content dimension through routing, the catalog loader, and the search index; the version-by-locale shape should be designed once, before either is built. `apps/docs` already resolves each package's _current_ docs from its latest release tag rather than the working tree (`docs/ci.md`, "Publish-scoped content"), which settled the snapshot-on-publish-vs-build-from-git-tags question for that narrower problem — it took the git-tag route. Versioning is a different, larger step: browsing a _past_ version concurrently with the current one, not just keeping the live site in step with the latest release. Open question: the URL scheme.
- **Per-package feature work.**
  - `@codenhub/error`: canonical translation map for built-in registry message keys; framework error-boundary adapters.
  - `@codenhub/i18n`: pluralization and ICU formatting.
  - `@codenhub/toaster`: stacking / position container controls; richer interactions and animation.
  - `@codenhub/validation`: form-schema adapters; custom validator pipeline.
  - `@codenhub/kbd`: key-combo recording / remapping helper.
  - `@codenhub/skills`: npm-publish validation and a clean-machine `npx` / `pnpm dlx` path; more core skill templates.
  - `@codenhub/components`: property / event declaration API stabilization; expanded component library.
  - `@codenhub/icons`: a first-party family owning the semantic names.

## Later / Possible

- **New packages.** `@codenhub/a11y` (focus management, ARIA primitives, accessibility utilities); `@codenhub/ui` (high-level layout and composite primitives).

## Not Planned

- **Changesets.** It brings its own versioning model, file format, and release-PR bot next to a `hub release` that already knows this workspace. `hub release --cut` raises the version and scaffolds the changelog entry; a `changelog` check makes skipping it impossible.
- **Dependabot.** `docs/ci.md` accepts that action pins are updated by hand; automating them is a decision to revisit there, not a gap here.
- **Publish-on-merge.** A merge is a decision to change `main`, not to release, and a version bump has to stay revertible until someone tags it (`docs/specs/packages-lifecycle.md`).

## Notes

- **Delivery split.** All three deploy surfaces run from Cloudflare dashboard state — the `codenhub`, `codenhub-docs`, and `codenhub-demo` Workers Builds projects. The repository carries build configuration (`apps/*/wrangler.jsonc`) and, for `codenhub-docs` alone, one deploy-hook secret that lets a publish trigger a rebuild directly instead of waiting on a merge (`docs/ci.md`, "Publish-scoped content" and "Credentials"). `docs/ci.md` records each project's build watch-path excludes and the reasoning.
- **Release model.** A maintainer authorizes a release by pushing a `<package name>@<version>` tag; `.github/workflows/publish.yml` publishes through trusted publishing (OIDC, provenance), refusing a tag whose version disagrees with the manifest. The first release of a name is manual, because npm cannot configure a trusted publisher for a name that does not exist yet. `docs/specs/packages-lifecycle.md` and `docs/ci.md` own the rules.
- **Unlisted packages.** `router`, `store`, `theme`, the plugins, and `ui-kit` are internal, WIP, deprecated, or evaluated separately, and are absent from the per-package list above by intent.

## References

- `docs/ci.md` — pinned toolchain, pull-request workflow, deployment watch paths.
- `docs/specs/packages-lifecycle.md` — metadata, scripts, publishing, versioning.
- `docs/specs/packages-reference.md` — generated API reference contract.
- `docs/specs/packages-demo.md` — package demo and aggregator contract.
- `docs/specs/roadmaps.md` — how this file is structured.
- `packages/app-shell/docs/internal/architecture.md`, `apps/demo/docs/internal/architecture.md` — deploy-surface architecture.
