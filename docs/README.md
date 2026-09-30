---
status: IMPLEMENTED
last_updated: 2026-09-30
scope: Index of repository-wide documentation.
---

# Repository documentation

Root `docs/` contains durable repository knowledge. Package-specific consumer and maintainer documentation lives with each workspace package. [Contributing](../CONTRIBUTING.md) contains the contributor workflow; [agent instructions](../AGENTS.md) contain agent behavior guidance.

## Guidelines

| Document                                     | Contains                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Code](guidelines/code.md)                   | Coding conventions, architecture, TypeScript, testing practices, and source API documentation.           |
| [Documentation](guidelines/documentation.md) | Documentation ownership, metadata, status and authority, formatting, layout, and exception requirements. |
| [Branding](guidelines/branding.md)           | Package naming and visual identity conventions.                                                          |

## Repository references

| Document              | Contains                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| [Tooling](tooling.md) | Root scripts, selectors, options, execution, reporting, compliance checks, and generators. |
| [CI](ci.md)           | Pinned toolchain, verification jobs, deployment, previews, and publishing workflows.       |
| [Assets](assets.md)   | Shared asset ownership, placement, and distribution.                                       |
| [Roadmap](roadmap.md) | Repository-level intended direction.                                                       |

## Specifications

| Document                                                         | Contains                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Package lifecycle](specs/packages-lifecycle.md)                 | Package metadata, scripts, exports, builds, publication, and versioning.                  |
| [Package documentation](specs/packages-documentation.md)         | Consumer and maintainer documentation surfaces, ownership, completeness, and publication. |
| [Package README](specs/packages-readme.md)                       | Public package README requirements.                                                       |
| [README template](specs/packages-readme-template.md)             | A starting structure for a public package README.                                         |
| [Documentation index template](specs/packages-index-template.md) | An advisory structure for a package documentation index.                                  |
| [API reference](specs/packages-reference.md)                     | Generated package API reference contracts.                                                |
| [Package exceptions](specs/packages-exceptions.md)               | Scoped exceptions and compliance-check waivers.                                           |
| [Package changelog](specs/packages-changelog.md)                 | Recommended changelog structure and release entries.                                      |
| [Package development](specs/packages-development.md)             | Optional playground, dev, and debug environments.                                         |
| [Package demos](specs/packages-demo.md)                          | Package demos and the application that aggregates them.                                   |
| [Tests](specs/tests.md)                                          | Test categories, configuration, scripts, and coverage expectations.                       |
| [Errors](specs/errors.md)                                        | Consumer-facing error conventions and documentation.                                      |
| [Roadmaps](specs/roadmaps.md)                                    | Durable roadmap structure and content.                                                    |
