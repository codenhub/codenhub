---
status: IMPLEMENTED
last_updated: 2026-10-18
scope: Package identity and presentation metadata declared in `package.json#codenhub`.
---

# Package metadata spec

This document defines the metadata a workspace package declares about itself under `codenhub` in its `package.json`: what it is called, how stable it is, and how the sites that present it should list it. The documentation site and the package list and pages on `codenhub.dev` both read it; neither owns it.

The shared reader is `parsePackageMetadata` in `@codenhub/tools/documentation` (`packages/tools/src/documentation/package-metadata.ts`). Tools read metadata through it rather than reading `codenhub` fields directly, so every surface applies the same defaults and rejects the same malformed input.

## Fields

```json
{
  "codenhub": {
    "label": "Example Package",
    "status": "active",
    "description": "Utilities for building example workflows.",
    "logo": "assets/logo.svg",
    "listed": true,
    "slug": "example-package",
    "order": 10,
    "demoUrl": "https://example.coden.agency",
    "docs": {}
  }
}
```

- `label`: REQUIRED human-readable package name, used for navigation, catalogs, and page titles. `docs/guidelines/branding.md` says how to choose it.
- `status`: REQUIRED. One of `active`, `experimental`, or `deprecated`, with the meanings below.
- `description`: OPTIONAL catalog description. It defaults to the package `description`.
- `logo`: OPTIONAL package-relative path to an SVG file, such as `assets/logo.svg`. It MUST NOT be absolute, MUST NOT contain `.` or `..` segments or backslashes, and MUST name a file that exists in the package. Sites read it from the package's release tag, so it does not need to be listed in `files`.
- `listed`: OPTIONAL boolean controlling catalog discovery. It defaults to `true`. When `false`, catalogs MUST omit the package, but documentation tools MUST still publish its documentation routes. This is not an access-control mechanism; unlisted pages remain reachable by direct URL.
- `slug`: OPTIONAL stable kebab-case identifier. It defaults to the unscoped package name, such as `styles` for `@codenhub/styles`.
- `order`: OPTIONAL non-negative integer for relative ordering. Lower values appear first; tools MUST use a deterministic fallback when it is absent.
- `demoUrl`: OPTIONAL absolute URL to a standalone live demo application. Sites MAY use it to link to or embed the demo.

`codenhub` also carries fields owned by other specs, which this one does not define: `docs` (`docs/specs/packages-documentation.md`, with `docs.reference` in `docs/specs/packages-reference.md`), `assets` (`docs/specs/packages-demo.md`), and `bundled` (`docs/specs/packages-lifecycle.md`).

Every `private: false` package MUST declare `label` and `status`. Slugs MUST be unique across the workspace. A malformed field is invalid; tools MUST NOT fall back to other manifest fields to hide a missing required field or a malformed one.

Status has these meanings:

- `active`: Supported for normal consumer use.
- `experimental`: Publicly available, but some identified part of its API, behavior, output, or support level remains unstable. `docs/specs/packages-readme.md` says how the README states which.
- `deprecated`: Retained for existing consumers but not recommended for new adoption.

## Why identity is not under `docs`

These fields used to live inside `codenhub.docs`, because the documentation site was the first and only surface that presented packages. That stopped being true when `apps/www` became the package list at `codenhub.dev/packages/` and `apps/demo` also listed packages: both read a package's label and status without having anything to do with its documentation, and `status` also drives the README notice the `readme` check enforces. Identity describes the package, so it sits on `codenhub` beside the other package-level fields. `codenhub.docs` keeps what is genuinely about the documentation site: whether the package opts in, and how its reference is generated.

Two alternatives were weighed. A nested `codenhub.package` object would group identity, but adds a level every reader and author goes through for no separation `codenhub` itself does not already give. One object per site (`codenhub.docs`, `codenhub.www`, …) would let each site evolve independently, but `label` and `status` would be declared once per site and drift apart.

## Pre-migration manifests

Release tags cut before this layout carry the old one, with identity inside `codenhub.docs`:

```json
{ "codenhub": { "docs": { "label": "Example Package", "status": "active", "reference": {} } } }
```

The sites read package content from each package's release tag (`docs/ci.md`, "Publish-scoped content"), so the reader accepts that shape too and resolves it to the same metadata; `logo` does not exist in it. A manifest that declares identity in both places is invalid. The working tree MUST use the current shape: `hub check` reports `documentation/legacy-metadata` for the old one.

Support for the old shape is temporary and MUST be removed as soon as no site needs it: once the newest release tag of every package that declares `codenhub.docs` uses the current shape, delete `usesLegacyMetadata` and the legacy branch of `parsePackageMetadata`, the `documentation/legacy-metadata` finding, this section, and the matching item in `docs/roadmap.md`. Each package moves to the current shape with its next release, so no extra releases are needed to get there.

Some release tags predate `codenhub` metadata altogether: their manifest declares no `codenhub` at all. The documentation site leaves such a package out, because it has no documentation opt-in at that release. The package list on `codenhub.dev` still lists it, falling back to the npm `name` and `description` with no status, because the package is on npm and the index exists to find it. This fallback is the same kind of allowance as the old shape and ends the same way: remove it from `apps/www/src/lib/catalog.ts` and `apps/www/src/lib/release-snapshot-integration.ts` once the newest stable release tag of every `private: false` package declares `codenhub.label` and `codenhub.status`, together with this paragraph.
