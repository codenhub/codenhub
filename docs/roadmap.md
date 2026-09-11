---
status: APPROVED
last_updated: 2026-09-08
scope: repo-wide direction for the workspace's packages and deploy surfaces
---

# Roadmap

## Purpose

Durable direction for the workspace: what is being worked on now, what is intended, and what has been ruled out. Per-package release conditions and deferred work live in each package's `docs/internal/roadmap.md`; this file stays at the level of the whole repository.

## Current Focus

- **Public surface stabilization.** `apps/www` is the site index at `codenhub.dev` — the canonical package list and the entry point to docs, demos, and source. `@codenhub/app-shell` is the private package the three deploy surfaces share so their chrome is identical, and `apps/docs` / `apps/demo` have slimmed their landing pages to a searchable list that routes into their own surface.
- **`@codenhub/styles` post-`0.1` evaluation.** `0.1.0` and `0.1.1` are published, `0.1.1` through the tag workflow. The model, machine-checked contract, and shipped aesthetics are in place; the focus is now a stress-test pass to find what to fix, add, or drop before the surface grows. Direction is in `packages/styles/docs/internal/roadmap.md`.
- **`apps/docs` polish.** UI/UX and code cleanup, and the navigation rework: a clearer scheme for what individual sidebar entries are named, per-symbol reference anchors, search weighting, and the deck treatment (`description` / `since`) for hand-authored pages. The Guides / Reference / Changelog tab strip has landed; deeper sidebar nesting was weighed and rejected.
- **Generated API reference rollout.** The generator, the `reference` check, and the `codenhub.docs.reference` opt-in are proven on `@codenhub/error`. Next: opt in packages with different shapes (`icons`, `kbd`, `router`, `validation`) to find where generated signatures and prose fall short, then flip to default-on with a `codenhub.docs.reference: false` opt-out.

## Planned

- **Repository governance.** `SECURITY.md` is the one with a real trigger: provenance-attested packages invite an audit and this repository answers nowhere for a report. `CODEOWNERS` and a pull-request template pay off once more than one person reviews here.
- **Backfill package demos.** `apps/demo` aggregates `packages/*/demo/`, and only `icons` and `styles` have one, so the deployed surface shows two of thirteen public packages.
- **Bootstrap the unpublished packages.** `components`, `i18n`, `kbd`, `toaster`, `tauri-plugin-webview`, and `tauri-plugin-window` have never been published; each needs one manual `hub publish` from a maintainer's machine before its trusted publisher can be configured on npm.
- **Documentation MCP server.**
- **Documentation versioning, then localization.** Keep docs for past package versions, then localize with `@codenhub/i18n`. Both thread a content dimension through routing, the catalog loader, and the search index; the version-by-locale shape should be designed once, before either is built. Open questions: snapshot-on-publish vs. build-from-git-tags, and the URL scheme.
- **Per-package feature work.**
  - `@codenhub/error`: canonical translation map for built-in registry message keys; framework error-boundary adapters.
  - `@codenhub/i18n`: pluralization and ICU formatting.
  - `@codenhub/toaster`: stacking / position container controls; richer interactions and animation.
  - `@codenhub/validation`: form-schema adapters; custom validator pipeline.
  - `@codenhub/kbd`: key-combo recording / remapping helper.
  - `@codenhub/skills`: npm-publish validation and a clean-machine `npx` / `pnpm dlx` path; more core skill templates.
  - `@codenhub/components`: property / event declaration API stabilization; expanded component library.
  - `@codenhub/icons`: searchable icon catalog in the documentation site; a first-party family owning the semantic names.

## Later / Possible

- **New packages.** `@codenhub/a11y` (focus management, ARIA primitives, accessibility utilities); `@codenhub/ui` (high-level layout and composite primitives).
- **Better playgrounds** for `kbd`, `error`, and `icons`, built on the internal packages rather than in isolation.
- **CSS-mode unresolved-icon-class warning** for `@codenhub/icons`. Worth doing; the open question is where it would be raised from, since the scan sees classes one module at a time and never knows the set is complete.
- **`.md` / `.mdx` icon rewriting** in an Astro host. An integration working on the emitted HTML at `astro:build:done` would cover them, at the cost of a new public entrypoint and of missing per-request output — not obviously worth it yet.
- **A `prose: false` signature-only reference manifest**, which could go wider than the prose reference before per-package TSDoc quality is known.

## Not Planned

- **Changesets.** It brings its own versioning model, file format, and release-PR bot next to a `hub release` that already knows this workspace. `hub release --cut` raises the version and scaffolds the changelog entry; a `changelog` check makes skipping it impossible.
- **Dependabot.** `docs/ci.md` accepts that action pins are updated by hand; automating them is a decision to revisit there, not a gap here.
- **Publish-on-merge.** A merge is a decision to change `main`, not to release, and a version bump has to stay revertible until someone tags it (`docs/specs/packages-lifecycle.md`).
- **Deeper `apps/docs` sidebar nesting.** Deep trees are their own navigation cost.

## Notes

- **Delivery split.** All three deploy surfaces run from Cloudflare dashboard state — the `codenhub`, `codenhub-docs`, and `codenhub-demo` Workers Builds projects. The repository carries build configuration (`apps/*/wrangler.jsonc`) and nothing else: no deploy workflow, no credentials. `docs/ci.md` records each project's build watch-path excludes and the reasoning.
- **Release model.** A maintainer authorizes a release by pushing a `<package name>@<version>` tag; `.github/workflows/publish.yml` publishes through trusted publishing (OIDC, provenance), refusing a tag whose version disagrees with the manifest. The first release of a name is manual, because npm cannot configure a trusted publisher for a name that does not exist yet. `docs/specs/packages-lifecycle.md` and `docs/ci.md` own the rules.
- **Unlisted packages.** `router`, `store`, `theme`, the plugins, and `ui-kit` are internal, WIP, deprecated, or evaluated separately, and are absent from the per-package list above by intent.
- **Icon delivery decisions** — the `<i>` / `.ic` element model, the `ic-xs`–`ic-xl` size axis, and what an inlined icon loses — are shipped and documented in the `@codenhub/icons` package docs.

## References

- `docs/ci.md` — pinned toolchain, pull-request workflow, deployment watch paths.
- `docs/specs/packages-lifecycle.md` — metadata, scripts, publishing, versioning.
- `docs/specs/packages-reference.md` — generated API reference contract.
- `docs/specs/packages-demo.md` — package demo and aggregator contract.
- `docs/specs/roadmaps.md` — how this file is structured.
- `packages/styles/docs/internal/roadmap.md` — `@codenhub/styles` direction and open questions.
- `packages/app-shell/docs/internal/architecture.md`, `apps/demo/docs/internal/architecture.md` — deploy-surface architecture.
