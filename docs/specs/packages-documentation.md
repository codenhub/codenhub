---
status: APPROVED
last_updated: 2026-07-16
scope: Documentation for workspace packages under `packages/*`.
---

# Package documentation spec

This document defines how packages document consumer-facing behavior and
maintainer knowledge. It sets clear ownership and publication boundaries while
allowing each package to organize documentation around its own domain.

## Compliance

Every `private: false` package under `packages/*` MUST follow this spec and MUST
declare its public documentation metadata as defined below. Private packages
MAY opt in to this spec by declaring the same metadata. Private packages and
apps without public documentation metadata are not required to comply unless
another document says so.

Public packages MUST contain:

```text
README.md
llms.txt
llms-full.txt
docs/
  index.md
  internal/
```

All four documentation surfaces are required even for small packages. Their
content MAY remain concise when the package has a small API or one clear use
case. `docs/internal/` MAY be empty or absent until maintainer-only knowledge
exists, but it is the required location for such knowledge.

## Public documentation metadata

Public documentation eligibility and package-level presentation metadata belong
in the package's `package.json` under `codenhub.docs`:

```json
{
  "codenhub": {
    "docs": {
      "status": "active",
      "slug": "example-package",
      "label": "Example Package",
      "description": "Utilities for building example workflows.",
      "order": 10
    }
  }
}
```

The presence of `codenhub.docs` declares that the package has public
documentation intended for discovery and publication. Its fields are:

- `status`: REQUIRED documentation status. Allowed values are `active`,
  `experimental`, and `deprecated`.
- `slug`: OPTIONAL stable kebab-case identifier. It defaults to the unscoped
  package name, such as `styles` for `@codenhub/styles`.
- `label`: OPTIONAL human-readable package label. It defaults to the package
  `name`.
- `description`: OPTIONAL short catalog description. It defaults to the package
  `description`.
- `order`: OPTIONAL non-negative integer used for relative ordering. Lower
  values appear first; tools MUST use a deterministic fallback when it is
  absent.

Explicit `slug`, `label`, and `description` values SHOULD be used only when the
package metadata fallback is inadequate. Slugs MUST be unique among packages
that declare public documentation metadata. Package consumers and documentation
tools MAY ignore presentation fields they do not need.

Documentation status has these meanings:

- `active`: Supported for normal consumer use.
- `experimental`: Publicly available, but some identified part of its API,
  behavior, output, or support level remains unstable.
- `deprecated`: Retained for existing consumers but not recommended for new
  adoption.

## Documentation ownership

Each surface has one primary role:

- `README.md`: Small human entrypoint for evaluating and starting with the
  package. It follows `docs/specs/packages-readme.md`.
- `docs/index.md`: Canonical entrypoint to the package's complete public
  documentation.
- Other public files under `docs/`: Complete public API coverage and deeper
  usage guidance.
- `docs/internal/`: Unpublished durable knowledge needed to maintain the
  package.
- `llms.txt`: Small LLM-oriented router to package purpose and public docs.
- `llms-full.txt`: LLM-oriented compilation of the README and public docs.

Avoid repeating the same explanation across these surfaces. Link to the
canonical document instead. Public docs and source JSDoc/TSDoc jointly describe
the supported consumer contract; LLM files are derived views, not sources of
truth.

## Public API discipline

Documentation work MUST start by reviewing the package's public surface. An
export is a support commitment, not an invitation to publish implementation
helpers.

Packages MUST export only values, types, files, and subpaths intended for
consumer use. Implementation details that consumers should not access MUST stay
unexported from package entrypoints and `package.json` `exports`. Do not preserve
an accidental export merely to document it.

Public docs MUST provide complete coverage at the public entrypoint and API
surface level. Every supported import path and consumer-facing surface must be
discoverable and explained. Source JSDoc/TSDoc remains responsible for detailed
per-symbol behavior as required by `docs/code-guidelines.md`.

## Public documentation

Every package covered by this spec MUST provide `docs/index.md`. It MUST:

- Use the package name as its H1.
- Summarize the package's purpose and supported scope.
- Direct consumers to the main starting points and every top-level
  documentation area.
- Surface critical compatibility, stability, and deprecation information.

The index is the canonical entrypoint to complete package documentation. The
README remains a separate concise entrypoint for evaluation and first use; it
MUST link to the documentation index but SHOULD NOT duplicate its complete
navigation or detail.

Organize public docs around consumer tasks, concepts, domains, or entrypoints.
Use guides, examples, reference material, troubleshooting, migrations,
compatibility notes, and accessibility guidance when they help consumers.

Prefer focused documents over one oversized reference. Prefer grouping related
APIs by domain or entrypoint over separating them mechanically into files such
as `methods.md` and `types.md`.

These structures are examples, not required names or checklists:

```text
docs/
  index.md
  getting-started.md
  reference.md
  examples.md
  troubleshooting.md
```

```text
docs/
  index.md
  concepts/
  guides/
  reference/
  migrations/
  troubleshooting.md
```

Packages SHOULD adapt their structure when another organization better matches
their public surface. Do not add `docs/README.md`; `docs/index.md` owns the
documentation entrypoint.

Public documentation paths MUST be deterministic and portable:

- Markdown file and directory names MUST use kebab-case.
- An `index.md` represents its containing documentation area.
- Other Markdown files represent a document named after their relative path.
- Package-relative Markdown links MUST be used for package-owned documents and
  assets.
- Public documentation assets SHOULD live under `docs/assets/` unless
  colocating an asset makes ownership materially clearer.
- Public documents MUST NOT depend on repository-local aliases, private files,
  or environment-specific paths.

For example, `docs/guides/index.md` is the entrypoint for the `guides` area and
`docs/guides/integration.md` identifies its `integration` document. A publishing
tool MAY add its own outer location without changing these package-relative
identifiers.

Public docs MUST:

- Describe current supported consumer behavior rather than private
  implementation.
- Match public exports, defaults, constraints, and observable failure behavior.
- Use small, realistic, copyable examples.
- Avoid stale TODOs, speculative promises, secrets, private URLs, and local
  machine paths.
- Avoid linking to `docs/internal/`.

Public package docs MUST NOT use repository governance frontmatter. They MAY use
portable presentation frontmatter containing:

- `title`: Page title; defaults to the document's H1.
- `description`: Short page summary.
- `order`: Non-negative integer for ordering sibling documents.

Presentation frontmatter is optional and MUST NOT become necessary to understand
the document outside a publishing tool. After optional frontmatter, every public
document MUST begin with exactly one consumer-facing H1. Tools MUST use a
deterministic fallback order when `order` is absent.

Deprecated packages MUST state their status near the top of `README.md` and
`docs/index.md` and point to a replacement when one exists. Experimental
packages MUST identify what remains unstable in both entrypoints. Supporting
tools MAY use `codenhub.docs.status` to present the same package-wide status
without requiring every public document to repeat it.

## Internal documentation

Use `docs/internal/` for durable maintainer knowledge such as architecture,
design rationale, invariants, decisions, release procedures, and debugging
guidance. For example:

```text
docs/internal/
  architecture.md
  decisions.md
  release-process.md
  debugging.md
```

These names are illustrative. Internal docs MUST use the YAML metadata and
status model from `docs/docs-guidelines.md` because they may describe approved
future direction as well as current implementation.

Do not use `docs/internal/` for scratch notes, short-lived plans, TODO lists, or
information better expressed in code comments or issue tracking.

## LLM documentation

`llms.txt` MUST be a concise, hand-authored router following the established
[llms.txt format](https://llmstxt.org/):

- One H1 containing the published package name.
- A blockquote summarizing purpose and essential context.
- Short guidance needed to interpret or use the package correctly.
- H2 sections containing described Markdown links to public documentation,
  including `docs/index.md` as the primary documentation entrypoint.
- An `Optional` section only for secondary context that can be skipped.

Prefer package-relative links so the published artifact remains self-contained.
Canonical external URLs MAY supplement those links.

`llms-full.txt` MUST contain the package README, `docs/index.md`, and then all
remaining public Markdown documentation in deterministic order. It MUST
preserve Markdown formatting despite the `.txt` extension and MUST exclude
`docs/internal/`, source code, tests, generated declarations, and raw
JSDoc/TSDoc extraction.

`llms-full.txt` MAY be maintained manually while no generator exists. Once
generation tooling exists, packages SHOULD generate it from canonical public
docs in deterministic order. Generated content MUST identify its source docs
and MUST NOT become a competing contract.

## Consumer and maintainer truth

The README, public docs, and LLM files MUST describe current supported behavior.
Public docs and source JSDoc/TSDoc MUST use the same terms, defaults,
constraints, and observable failure behavior.

Internal docs MAY describe intended direction according to their `status`.
Planned APIs and behavior belong in internal docs until publicly available.
Public roadmap or stability notes MAY mention future work only when it directly
helps consumers make current adoption or migration decisions.

Changes to public exports, behavior, constraints, or failure behavior MUST
update affected source docs, README content, public docs, and LLM files in the
same change. Generated LLM files MUST be regenerated when their inputs change.

## Publishing

Published package tarballs MUST include `README.md`, public `docs/`, `llms.txt`,
and `llms-full.txt`. They MUST exclude `docs/internal/`.

The exclusion mechanism is package-specific. A nested `docs/.npmignore` is one
valid option when `package.json` includes `docs/`; it is not required when
another reliable mechanism is used.

Package `status:pack` checks or `npm pack --dry-run` MUST verify that required
public docs are present and internal docs are absent before publishing.

## Validation

Documentation checks SHOULD validate, without requiring a particular renderer:

- Required documentation surfaces and `docs/index.md` exist.
- Public document links and local asset references resolve.
- Public documents contain a title according to this spec.
- Relative paths produce unique document identifiers.
- `docs/internal/` is excluded from published and generated consumer material.
- Package documentation status matches notices in the README and documentation
  index.
- Generated `llms-full.txt` content matches its canonical inputs.

## Exceptions

Package documentation exceptions MUST follow `docs/docs-guidelines.md` and be
recorded in `docs/specs/packages-exceptions.md`.
