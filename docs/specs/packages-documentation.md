---
status: APPROVED
last_updated: 2026-07-15
scope: Documentation for workspace packages under `packages/*`.
---

# Package documentation spec

This document defines how packages document consumer-facing behavior and
maintainer knowledge. It sets clear ownership and publication boundaries while
allowing each package to organize documentation around its own domain.

## Compliance

Every `private: false` package under `packages/*` MUST follow this spec. Private
packages and apps MAY follow it when useful, but are not required to comply
unless another document says so.

Public packages MUST contain:

```text
README.md
llms.txt
llms-full.txt
docs/
  internal/
```

All four documentation surfaces are required even for small packages. Their
content MAY remain concise when the package has a small API or one clear use
case. `docs/internal/` MAY be empty or absent until maintainer-only knowledge
exists, but it is the required location for such knowledge.

## Documentation ownership

Each surface has one primary role:

- `README.md`: Small human entrypoint for evaluating and starting with the
  package. It follows `docs/specs/packages-readme.md`.
- `docs/`: Published consumer documentation, including complete public API
  coverage and deeper usage guidance.
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

Organize public docs around consumer tasks, concepts, domains, or entrypoints.
Use guides, examples, reference material, troubleshooting, migrations,
compatibility notes, and accessibility guidance when they help consumers.

Prefer focused documents over one oversized reference. Prefer grouping related
APIs by domain or entrypoint over separating them mechanically into files such
as `methods.md` and `types.md`.

These structures are examples, not required names or checklists:

```text
docs/
  getting-started.md
  reference.md
  examples.md
  troubleshooting.md
```

```text
docs/
  concepts/
  guides/
  reference/
  migrations/
  troubleshooting.md
```

Packages SHOULD adapt their structure when another organization better matches
their public surface. A `docs/README.md` is discouraged because it creates a
second human entrypoint beside the package README and can make navigation
ambiguous. It MAY be used when a package has a concrete need for a separate docs
index.

Public docs MUST:

- Describe current supported consumer behavior rather than private
  implementation.
- Match public exports, defaults, constraints, and observable failure behavior.
- Use small, realistic, copyable examples.
- Avoid stale TODOs, speculative promises, secrets, private URLs, and local
  machine paths.
- Avoid linking to `docs/internal/`.

Public package docs SHOULD NOT use repository governance frontmatter. Their
content should begin with the consumer-facing title and remain clean when
published.

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
- H2 sections containing described Markdown links to public documentation.
- An `Optional` section only for secondary context that can be skipped.

Prefer package-relative links so the published artifact remains self-contained.
Canonical external URLs MAY supplement those links.

`llms-full.txt` MUST contain the package README followed by all public Markdown
documentation. It MUST preserve Markdown formatting despite the `.txt`
extension and MUST exclude `docs/internal/`, source code, tests, generated
declarations, and raw JSDoc/TSDoc extraction.

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

## Exceptions

Package documentation exceptions MUST follow `docs/docs-guidelines.md` and be
recorded in `docs/specs/packages-exceptions.md`.
