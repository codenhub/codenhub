---
status: IMPLEMENTED
last_updated: 2026-11-09
scope: Index of repository-wide documentation.
---

# Documentation

`docs/` holds durable project knowledge. [Contributing](../CONTRIBUTING.md) contains the contributor workflow, and [agent instructions](../AGENTS.md) contain how agents work here. The [documentation guidelines](guidelines/documentation.md) define how these documents are written, what their status means, and how they change.

Every document in `docs/` is listed here. Adding, moving, or deleting one updates this index in the same change.

Package-specific consumer and maintainer documentation lives with each workspace package; this index covers what holds across the repository. Start with the [roadmap](roadmap.md) for where the repository is heading.

## Overview

| Document              | Contains                             |
| --------------------- | ------------------------------------ |
| [Roadmap](roadmap.md) | Repository-level intended direction. |

## Guidelines

| Document                                     | Contains                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Code](guidelines/code.md)                   | Naming, design, TypeScript, async and errors, testing practices, and documentation in code.              |
| [Documentation](guidelines/documentation.md) | Metadata, prompts, status and authority, recording decisions, exceptions, layout, and the writing voice. |
| [Security](guidelines/security.md)           | Secrets, untrusted input, what stays out of logs, and reviewing a change.                                |

| Document                                                 | Contains                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Brand](guidelines/brand.md)                             | Where Coden's brand is published, and how this repository names and presents its packages. |
| [Package naming](guidelines/package-naming.md)           | The branding test, naming vocabulary, title presentation, and each package's display name. |
| [Public docs writing](guidelines/public-docs-writing.md) | What a public package doc adds to the documentation guidelines' writing voice.             |

## Repository references

| Document                  | Contains                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Workspace](workspace.md) | The root scripts and what each guarantees, the shared tool configurations, and dependency versions.              |
| [Tooling](tooling.md)     | How the scripts are implemented, the TypeScript and Vitest configuration, narrowing a run, and adding a package. |
| [CI](ci.md)               | The pinned toolchain, the verification jobs, and dependency updates.                                             |

## Specifications

| Document                | Contains                                                          |
| ----------------------- | ----------------------------------------------------------------- |
| [Tests](specs/tests.md) | Test categories, locations, configuration, scripts, and coverage. |

| Document                                                         | Contains                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Package lifecycle](specs/packages-lifecycle.md)                 | Package metadata, scripts, exports, builds, publication, and versioning.                  |
| [Package metadata](specs/packages-metadata.md)                   | Package identity and presentation metadata in package.json#codenhub.                      |
| [Package documentation](specs/packages-documentation.md)         | Consumer and maintainer documentation surfaces, ownership, completeness, and publication. |
| [Package README](specs/packages-readme.md)                       | Public package README requirements.                                                       |
| [README template](specs/packages-readme-template.md)             | A starting structure for a public package README.                                         |
| [Documentation index template](specs/packages-index-template.md) | An advisory structure for a package documentation index.                                  |
| [API reference](specs/packages-reference.md)                     | Generated package API reference contracts.                                                |
| [Package translations](specs/packages-translations.md)           | Translated READMEs and docs, drift checks, and how translations publish.                  |
| [Documentation versions](specs/packages-docs-versions.md)        | Which past package versions the documentation site keeps, their URLs, and how they build. |
| [Package exceptions](specs/packages-exceptions.md)               | Scoped exceptions and compliance-check waivers.                                           |
| [Package changelog](specs/packages-changelog.md)                 | Recommended changelog structure and release entries.                                      |
| [Package development](specs/packages-development.md)             | Optional playground, dev, and debug environments.                                         |
| [Package demos](specs/packages-demo.md)                          | Package demos and the application that aggregates them.                                   |
| [Errors](specs/errors.md)                                        | Consumer-facing error conventions and documentation.                                      |
| [Roadmaps](specs/roadmaps.md)                                    | Durable roadmap structure and content.                                                    |
