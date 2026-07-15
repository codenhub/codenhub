---
status: APPROVED
last_updated: 2026-07-15
scope: README files for workspace packages.
---

# Package README spec

This document defines the predictable structure and concise content expected in
package README files. Full package documentation follows
`docs/specs/packages-documentation.md`.

## Compliance

Every `private: false` package under `packages/*` MUST have a `README.md` that follows this spec.

Private packages and apps MAY follow this spec when it improves maintainability, onboarding, or usage clarity. They are not required to comply unless another document says so.

## Purpose

A package README is the small human entrypoint for evaluating and starting with
the package. It owns package purpose, installation, the main happy path, links to
full documentation, and critical constraints consumers must see before adopting
the package.

The README MUST stay concise. Complete API reference, advanced workflows,
extended examples, troubleshooting, and migrations belong in published
package-level `docs/`. Maintainer rationale and workflows belong in
`docs/internal/`.

## Required structure

Public package README files MUST follow this order unless a section is omitted
under the omission rules:

1. Title: package name exactly as published, such as `# @codenhub/theme`.
2. Description: short purpose, intended consumers, and essential behavior.
3. Installation: package manager commands or package name when consumers install
   it directly.
4. Usage: one minimal working example for the main use case.
5. Documentation: links to published guides and complete reference material.
6. Requirements: runtime, framework, peer dependency, CSS, SSR, storage, DOM, or
   build-tool requirements when applicable.
7. Notes: critical limitations, stability, compatibility, failure behavior, or
   non-goals when applicable.
8. License: package license and required third-party notices when applicable.

Use these heading names when practical. Small wording changes are allowed when
they improve clarity, but section purpose MUST remain recognizable.

## Documentation links

The Documentation section MUST link to the package's public `docs/` content and
make complete API reference easy to find. Link directly to useful documents
rather than only to a directory when repository rendering would make navigation
unclear.

The README MAY include a small API or entrypoint overview when it helps readers
choose the right starting path. It MUST NOT contain an exhaustive symbol catalog
or duplicate full reference material.

## Omission rules

README files MUST NOT omit package purpose, the main use case, documentation
links, or critical constraints to save space. Optional sections MAY be omitted
when they do not apply:

- Omit `Installation` only when the package is never installed directly by consumers.
- Omit extra package-manager commands when the package name is sufficient.
- Omit `Requirements` when no requirements exist beyond normal installation.
- Omit `Notes` when no critical caveat belongs there.
- Omit detailed `License` text only when the repository license is sufficient and
  the package contains no third-party code or assets requiring attribution.

Public packages containing third-party code or assets MUST document required
attributions and include a corresponding package-level `NOTICE` file.

Very small packages MAY combine sections when all required information stays
present, accurate, and easy to scan.

## Template

Use [packages-readme-template.md](packages-readme-template.md) as the starting
point. Remove only sections allowed by the omission rules.

## Package type requirements

Package-specific requirements that affect first use MUST appear in the README;
full detail belongs in public docs. Examples include:

- Input validation or coercion boundaries for utility packages.
- Browser API, SSR, and cleanup behavior for browser packages.
- CSS imports, customization, framework, and accessibility responsibilities for
  UI or CSS packages.
- Plugin order, peer dependencies, and generated output for build-tool packages.
- Type-only import style and absence of runtime behavior.
- Asset naming, stability, and bundler requirements.

## Optional sections

README files MAY add concise sections when they materially help first use:

- API overview.
- Changelog link.
- Related packages.

### Features or support status

Packages MAY include a small feature, support, or stability table when consumers
need a quick view of mixed maturity across public surfaces.

Use clear status labels:

| Status       | Meaning                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Stable       | Supported for normal use. Breaking changes follow package lifecycle rules.                                                   |
| Experimental | Available for testing or early adoption. API, behavior, or output may change.                                                |
| WIP          | Work in progress. Not implemented yet.                                                                                       |
| Planned      | No public surface available yet. Mention only when it affects current consumer decisions and approved package docs cover it. |

Example table:

| Feature           | Status       | Notes                                                |
| ----------------- | ------------ | ---------------------------------------------------- |
| Core API          | Stable       | Default supported consumer path.                     |
| Plugin entrypoint | Experimental | API shape may change before next stable release.     |
| React adapter     | WIP          | Missing SSR coverage.                                |
| CLI generator     | Planned      | Not available yet; tracked in approved package docs. |

Deprecated, experimental, unstable, or partially stable public surfaces SHOULD
state that status where consumers will see it before adoption. Planned surfaces
SHOULD appear only when internal approved docs cover them and they affect a
current adoption or migration decision; do not use README tables for general
roadmap promises.

## Content rules

README content MUST be accurate for the current published public API and match
the package's public docs and source JSDoc/TSDoc.

README content MUST NOT include:

- Examples that require private internals.
- Stale TODOs, roadmap promises, or speculative features.
- Marketing copy that does not help usage.
- Full API catalogs or long explanations better kept in public `docs/`.
- Secrets, private URLs, credentials, or environment-specific local paths.

Examples MUST be small, copyable, and realistic. Prefer complete snippets when
missing context would confuse users.

If an example omits setup for brevity, the omission MUST be obvious or stated.

Critical observable failure behavior SHOULD appear near README usage when it
changes safe first use. Full failure behavior belongs in public reference docs.

## Package states

Deprecated packages MUST state they are deprecated near the top and point to the replacement when one exists.

Experimental packages MUST state what is unstable: API shape, behavior, build output, or support level.

## Exceptions

Exceptions to this spec MUST follow `docs/docs-guidelines.md` and be recorded in
`docs/specs/packages-exceptions.md`.
