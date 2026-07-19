---
status: APPROVED
last_updated: 2026-07-18
scope: Documentation for public workspace packages.
---

# Package documentation spec

This document defines how packages document consumer-facing behavior and
maintainer knowledge. It sets clear ownership and publication boundaries while
allowing each package to organize documentation around its own domain.

## Compliance

Every `private: false` workspace package MUST follow this spec and MUST declare
its public documentation metadata as defined below. A package's location within
the workspace does not change these requirements. Private packages MAY opt in
to this spec by declaring the same metadata. Private packages and apps without
public documentation metadata are not required to comply unless another
document says so.

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
      "label": "Example Package",
      "status": "active",
      "listed": true,
      "slug": "example-package",
      "description": "Utilities for building example workflows.",
      "order": 10
    }
  }
}
```

The presence of `codenhub.docs` declares that the package has public
documentation intended for publication and, by default, catalog discovery. Its
fields are:

- `label`: REQUIRED human-readable package label used by documentation tools.
- `status`: REQUIRED documentation status. Allowed values are `active`,
  `experimental`, and `deprecated`.
- `listed`: OPTIONAL boolean controlling catalog discovery. It defaults to
  `true`. When `false`, catalogs MUST omit the package, but documentation tools
  MUST still publish its documentation routes. This is not an access-control
  mechanism; unlisted documentation remains accessible by direct URL.
- `slug`: OPTIONAL stable kebab-case identifier. It defaults to the unscoped
  package name, such as `styles` for `@codenhub/styles`.
- `description`: OPTIONAL catalog description. It defaults to the package
  `description`.
- `order`: OPTIONAL non-negative integer used for relative ordering. Lower
  values appear first; tools MUST use a deterministic fallback when it is
  absent.

Slugs MUST be unique among packages that declare public documentation metadata.
A malformed `codenhub.docs` object or field is invalid. Tools MUST NOT use
package metadata fallbacks to hide missing required fields or malformed public
documentation metadata.

Package catalogs MUST omit packages with `codenhub.docs.listed` set to `false`.
For listed packages, catalogs use `codenhub.docs.label` and use
`codenhub.docs.description` when present. A valid metadata object without a
documentation description falls back to the package `description`. When
cataloging a package without public documentation metadata, catalogs MAY fall
back to the package `name` and `description`. These fallbacks do not make a
non-compliant public package compliant with this spec. Package consumers and
documentation tools MAY ignore presentation fields they do not need.

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

Every package covered by this spec MUST provide `docs/index.md`. It is the
canonical human-facing entrypoint to complete package documentation and MUST be
the first package page shown by publishing tools. It follows the same content,
frontmatter, and H1 rules as every other public Markdown document; it has no
special heading or required content structure.

Use [packages-index-template.md](packages-index-template.md) as an advisory
starting point. Its content blocks are recommendations, not requirements.
Authors MAY omit, combine, rename, reorder, or replace them when another
structure better serves the package. Such changes do not require a documented
exception as long as the package documentation remains accurate, complete, and
discoverable.

The README remains a separate concise entrypoint for evaluation and first use;
it MUST link to the documentation index but SHOULD NOT duplicate its complete
navigation or detail. README and index content MAY overlap when useful.

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
- Publishing tools MUST place the package-root `docs/index.md` before every
  other package page.
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

Every public package `docs/**/*.md` file outside `docs/internal/` MUST start
with portable presentation frontmatter. Its schema is closed and contains only:

- `title`: REQUIRED non-empty page label used for navigation and sidebar labels
  and as the page-specific segment of the browser title.
- `description`: OPTIONAL non-empty page summary for metadata, previews, or
  search.

Unknown fields, including repository governance fields, are invalid. Every
public document MUST contain exactly one H1, but its text is unrestricted and
independent from the frontmatter title. Frontmatter controls presentation
metadata; Markdown controls article markup. Publishing tools MUST render the
Markdown body as authored and MUST NOT inject titles, descriptions, package
identifiers, status notices, or other metadata into the article body. Site
chrome outside the article body MAY present package metadata, navigation,
breadcrumbs, or status. Browser titles MUST add the package label between the
page title and site title so pages with common titles remain distinguishable.

Deprecated packages MUST state their status near the top of `README.md` and
point to a replacement when one exists. Experimental packages MUST identify
what remains unstable in `README.md`. Supporting tools MAY use
`codenhub.docs.status` to present the same package-wide status in site chrome
without requiring public documents to repeat it.
Documentation chrome MUST show warning status for experimental and deprecated
packages and MUST NOT show a status badge for active packages.

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
preserve authored Markdown bodies despite the `.txt` extension. It MUST omit
public-page presentation frontmatter and exclude `docs/internal/`, source code,
tests, generated declarations, and raw JSDoc/TSDoc extraction.

`llms-full.txt` MAY be maintained manually while no generator exists. Once
generation tooling exists, packages SHOULD generate it from canonical public
docs in deterministic order. Generated content MUST identify its source docs
and MUST NOT become a competing contract. A generator MAY rebase relative link
destinations so they resolve from `llms-full.txt`; this is the only allowed
change to copied Markdown bodies.

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

Documentation sites MUST publish non-hidden, non-Markdown files under public
`docs/` at the same path relative to the package documentation root. Packaging
control files such as `docs/.npmignore` are not public resources. Sites MUST
also publish a package-root `NOTICE` or `LICENSE` file when present. These
resources retain their package-relative names: for example,
`docs/assets/diagram.svg` is available as `assets/diagram.svg` and `NOTICE` is
available as `NOTICE` within that package's documentation route.

Public documents MAY link outside `docs/` only to package-root `NOTICE` and
`LICENSE` resources. Other paths escaping public `docs/`, all paths escaping the
package root, and all links into `docs/internal/` are invalid. Every linked local
resource in a hosted public document MUST exist in the documentation site
output. Every local target on any validation surface MUST exist in the package
tarball.

The exclusion mechanism is package-specific. A nested `docs/.npmignore` is one
valid option when `package.json` includes `docs/`; it is not required when
another reliable mechanism is used.

Package `status:pack` checks or `npm pack --dry-run` MUST verify that required
public docs are present and internal docs are absent before publishing.

## Validation

Documentation checks SHOULD validate, without requiring a particular renderer:

- Required documentation surfaces and `docs/index.md` exist.
- Public document links and local asset references resolve.
- Public documents use only the allowed frontmatter fields and contain a valid
  title and exactly one H1 according to this spec.
- Relative paths produce unique document identifiers.
- Package-root `docs/index.md` is placed before every other package page.
- `docs/internal/` is excluded from published and generated consumer material.
- Package documentation status matches notices in the README.
- Generated `llms-full.txt` content matches its canonical inputs.

Link validation MUST cover `README.md`, public `docs/**/*.md`, `llms.txt`, and
the Markdown content in `llms-full.txt`. It MUST validate Markdown links, local
assets, heading fragments, public-document boundaries, local target existence,
documentation-site publication for hosted public documents, and package-tarball
publication for all local links. Build-time validation MUST remain deterministic
and MUST NOT make network requests; external URLs are checked for valid syntax
only. Package-tarball publication MUST be checked using
`npm pack --dry-run --json` rather than an approximation of npm's inclusion
rules.

## Exceptions

Package documentation exceptions MUST follow `docs/docs-guidelines.md` and be
recorded in `docs/specs/packages-exceptions.md`.
