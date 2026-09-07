---
status: APPROVED
last_updated: 2026-09-07
scope: Recommended changelog documentation for workspace packages.
---

# Package changelog spec

This document defines how a package records its release history. Keeping one is recommended, not required.

## Compliance

Keeping a changelog costs little once a package has any consumer, and it's usually the first thing an upgrading consumer looks for. It is still optional: nothing in `docs/specs/packages-lifecycle.md` or `docs/specs/packages-documentation.md` requires one, and a package with no changelog is fully compliant with both.

A package opts in by adding a `docs/changelog/` directory as described below. There is no metadata flag to set on the package itself and no version at which a package is expected to start.

Once a package has opted in, keeping the changelog current stops being optional. `hub check`'s `changelog` rule reports `changelog/missing-entry` when the version in the manifest has no page and `changelog/unlinked-entry` when it has one `index.md` does not link. `hub release --cut` writes both, so the ordinary way to release also produces the entry; `docs/tooling.md` documents each.

## Structure

A changelog lives under the package's public `docs/`, alongside its other public documentation:

```text
docs/
  changelog/
    index.md      # curated: true — an ordered list of links, nothing else
    1.2.0.md
    1.1.0.md
    1.0.0.md
```

### `index.md` is a functional entrypoint, not a page

Set `curated: true` in its frontmatter, per `docs/specs/packages-documentation.md`. That flag tells the documentation site that this page's job is to list what to publish, not to be read as an article: only the version pages it links to, in the order it links them, get a route, a nav entry, and a search hit. It MAY also set `group` (for example `group: Changelog`) to label its sidebar section.

After the required H1, its body is an ordered list of links, newest first, and nothing else:

```markdown
---
title: Changelog
curated: true
---

# Changelog

- [1.2.0](1.2.0.md)
- [1.1.0](1.1.0.md)
- [1.0.0](1.0.0.md)
```

Releasing a new version means adding its file and one link here.

Keep every released version linked. The list is meant to grow — a link is one line and nothing is ever renumbered — and removing a link has a cost: an unlinked version page gets no route, no navigation entry, and no search result on the documentation site, so a consumer still on that version can no longer look up what changed in their release. The file itself is untouched and keeps shipping wherever public `docs/` ships, so it stays in the package tarball regardless. Drop a link only when keeping the version visible would mislead more than help, such as a pre-1.0 entry that no longer describes any supported behavior. Nothing is ever deleted and nothing moves to `docs/internal/`.

### Version pages own only their own content

Each released version gets its own file, named after the exact released version string: `1.2.0.md`, `2.0.0-beta.1.md`. This is a deliberate exception to the general kebab-case filename rule in `docs/specs/packages-documentation.md` — a version number isn't word-based, so kebab-casing it would only obscure the version it names. The exception is defined here, as a rule of this document, not as a package-specific bypass, so it does not need an entry in `docs/specs/packages-exceptions.md`.

A version page's frontmatter needs only `title`, the same as any ordinary public document. It SHOULD also set `date` to the release date in ISO `YYYY-MM-DD` form, and MAY set `description`. It does not need `order`, and does not need to know whether it is currently linked from `index.md` or not: publication is entirely `index.md`'s concern, not the page's.

A version page exists only for a version that is being released. Do not keep a running "Unreleased" page: the page is written as part of cutting the release, in the same change that raises the manifest version, and the tag that publishes it follows. `docs/specs/packages-lifecycle.md` owns that sequence and `hub release --cut` performs it.

## Entry format

Structure each version page's content with [Keep a Changelog](https://keepachangelog.com/) headings, including only the ones that apply to that release:

- `## Added` — new functionality.
- `## Changed` — changes to existing functionality.
- `## Deprecated` — functionality that still works but is on its way out.
- `## Removed` — functionality that no longer exists.
- `## Fixed` — bug fixes.
- `## Security` — fixes for a vulnerability.

Each heading's content is a short bullet list. Describe the change from the consumer's point of view, the same way `docs/specs/packages-lifecycle.md` expects breaking changes to be documented — what changed and why it matters to someone upgrading, not which files moved.

Putting the frontmatter and headings together, a complete `docs/changelog/1.2.0.md`:

```markdown
---
title: 1.2.0
date: 2026-09-05
---

# 1.2.0

## Added

- `parseConfig` accepts a `strict` option that rejects unknown keys instead of dropping them silently.

## Fixed

- `resolvePath` no longer throws on a trailing separator; it returns the normalized directory path.
```

## Linking from the README

`docs/specs/packages-readme.md` lists a changelog link as an optional README section. When a package has one, that link MUST point to `docs/changelog/index.md`.

## Exceptions

Exceptions to this spec MUST follow `docs/docs-guidelines.md` and be recorded in `docs/specs/packages-exceptions.md`.
