# Package README spec

**Status:** APPROVED
**Last updated:** 2026-06-08
**Scope:** README files for workspace packages.

This document defines the expected structure and content for package README files.

## Compliance

Every `private: false` package under `packages/*` MUST have a `README.md` that follows this spec.

Private packages and apps MAY follow this spec when it improves maintainability, onboarding, or usage clarity. They are not required to comply unless another document says so.

## Purpose

A package README is the public package usage contract for default behavior, the main use case, and the common happy path. It should explain what the package is expected to provide, how consumers should use it, what it exports for common consumer usage, and what constraints users must know before depending on it.

A package README SHOULD be useful as the first package design document: enough natural language to describe the intended public shape and basic behavior, followed by examples and reference material that code can implement and grow from. Code examples should demonstrate the documented behavior, not replace all explanation.

The README owns public consumer behavior, default usage, supported imports, constraints, and stability notes. Package-level `.docs/` files own deeper design rationale, advanced workflows, lifecycle rules, internal architecture, and extended examples. When full documentation would make the README noisy or difficult to scan, deeper guides SHOULD live in package-level `.docs/` files and the README SHOULD link to them.

The README SHOULD document public behavior, not internal implementation details.

## Required structure

Public package README files MUST follow this structure unless a section is explicitly omitted under the omission rules.

1. Title: package name exactly as published, such as `# @codenhub/theme`.
2. Description: short description of what the package does + important details users need to know.
3. Installation: package manager commands or package name, when the package is installed directly.
4. Usage: default and main consumer scenarios, including at least one minimal working example for the main use case.
5. Reference: catalog of documented public exports users are expected to call, instantiate, import, configure, or style against.
6. Examples: common workflows and real-world scenarios beyond the minimal usage path.
7. Requirements: browser, Node, SSR, framework, peer dependency, CSS, storage, DOM, or build-tool requirements.
8. Notes: flexible final section for limitations, non-goals, caveats, stability notes, or other package-specific considerations that do not fit earlier sections.

Headings should use these names when practical. Small wording changes are allowed when they improve clarity for the package, but the section purpose MUST stay recognizable. Optional sections MAY appear wherever they make the README easiest to understand, as long as the required information remains present, accurate, and easy to scan.

## Reference

The Reference section MUST document the primary public entrypoint listed in `package.json` `exports`, plus any subpath entrypoints that are part of default or common consumer usage. For each covered entrypoint, document the consumer-facing symbols available from it, such as functions, classes, types, structures, CSS files, plugins, config objects, assets, or other public package surfaces.

The Reference section SHOULD describe what each public surface is for, when to use it, and the default behavior it guarantees. It is intentionally a catalog of the default and common public surfaces; Usage and Examples are responsible for showing behavior, workflows, and main scenarios. Signatures alone are not sufficient documentation, and the README does not need to be exhaustive when deeper package-level `.docs/` would be clearer.

Document only public behavior. Do not document private files, implementation details, or exports that consumers should not use.

For small packages, one flat list of documented symbols is usually enough. For complex packages, the Reference section SHOULD be grouped by public entrypoint or surface area so consumers can find the right import path first, then the symbols under it. Prefer this structure when it improves scanability:

1. Entrypoint or surface heading, such as `@codenhub/package`, `@codenhub/package/plugin`, CSS, tokens, events, or CLI.
2. Short entrypoint purpose and when consumers should use it.
3. Import example for the entrypoint.
4. Public symbols or files available from that entrypoint.
5. Link to deeper package-level `.docs/` when the entrypoint has advanced workflows, edge cases, or many options.

If a package has many public entrypoints or advanced APIs, the README SHOULD cover the default and most common entrypoints, then link to package-level `.docs/` files for full details. The README should stay useful as a reference, not become exhaustive documentation when a separate guide would be clearer.

For each applicable item, include:

- Name and kind: function, class, type, interface, constant, event, CSS file, plugin, config object, or asset.
- Import path.
- Signature or shape, when applicable.
- Parameters, properties, or fields users need to provide or read.
- Return value, emitted value, generated output, or side effect.
- Error or failure behavior for any public API where failure is observable.
- A short example when the item is not obvious from quick start.

## Omission rules

README files SHOULD stay concise, but they MUST NOT omit default behavior, the main use case, common consumer usage, or important observable failure behavior to save space.

A section, API category, example group, or template surface MAY be omitted when it does not apply to the README-level public usage contract. Package authors SHOULD keep only what consumers need to install, use, evaluate, and safely depend on the package:

- Omit `Installation` only when the package is never installed directly by consumers.
- Omit extra package-manager commands when the package name is enough and the repository does not require one package manager in public docs.
- Omit functions when the package has no public functions.
- Omit classes when the package has no public classes.
- Omit methods when the package has no public methods.
- Omit events when the package emits, listens to, or documents no public events.
- Omit types or interfaces when the package exposes no public consumer-facing types.
- Omit CSS, assets, or plugin entrypoints when the package exposes none, or when they are advanced surfaces documented in package-level `.docs/` instead of the README.
- Omit additional examples when there is only one meaningful workflow.

Very small packages MAY have fewer headings and less template structure only when all applicable required information remains present and easy to scan.

Large packages MAY move deep guides to package-level `.docs/`, but README MUST still cover the public usage contract for default behavior, the main use case, and common consumer usage, then link to those guides.

README files MUST NOT contradict APPROVED or IMPLEMENTED package-level `.docs/` source-of-truth documents. When both describe the same public behavior, they MUST use the same terms, defaults, constraints, and observable failure behavior. When public behavior changes, update the README and relevant package-level `.docs/` files together when both are affected.

## Template

Use [packages-readme-template.md](packages-readme-template.md) as the starting point for public package README files. Remove only sections that are allowed by the omission rules.

## Package type requirements

Utility packages MUST document:

- Main exports and subpath imports that are part of default or common consumer usage.
- Input boundary expectations, especially for `unknown`, validation, coercion, and parsing.

Browser packages MUST document:

- Browser APIs used, such as `window`, `document`, `localStorage`, events, or media queries.
- SSR behavior when browser APIs are unavailable.
- Cleanup or lifecycle APIs when listeners, subscriptions, timers, or DOM mutations are used.

UI or CSS packages MUST document:

- Required CSS imports.
- Theme, token, class, attribute, or customization model.
- Accessibility responsibilities that belong to the package versus the consumer.
- Framework requirements, if any.

Build-tool or plugin packages MUST document:

- Minimal config example.
- Plugin order requirements.
- Peer dependencies and supported version ranges.
- Generated files, transformed files, or build output behavior.

Type-only packages MUST document:

- Public type or interface entrypoints.
- Runtime behavior, if none, as explicitly none.
- Expected import style, such as regular imports or `import type`.

Asset or token packages MUST document:

- Public assets, token files, or generated structures consumers are expected to import.
- Naming, stability, and customization expectations.
- Build-tool, bundler, or runtime requirements for consuming the assets.

## Optional sections

Use these sections when they add value:

- Recipes.
- Troubleshooting.
- Migration notes.
- FAQ.
- Changelog link.
- Related packages.

### Features or support status

Packages MAY include a feature, support, or stability table when consumers need a quick view of what is ready, risky, in progress, or not available yet. This table is optional, but recommended for packages with mixed maturity across public surfaces, integrations, adapters, generated output, or styling hooks.

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

Packages with deprecated, experimental, unstable, or partially stable public surfaces SHOULD state that status near the relevant README section when consumers need it to make safe adoption decisions. This is recommended when the package has behavior, APIs, generated output, styling hooks, or support levels that are not fully stable.

A status table MAY be used when a package has multiple public surfaces with different stability or lifecycle states. This is recommended when prose would make it hard to quickly see what is stable, experimental, deprecated, planned, or intentionally unsupported. Planned surfaces SHOULD appear only when approved package docs cover them and they help consumers understand current adoption, migration, or integration decisions; they MUST NOT be used as general roadmap promises.

## Content rules

README content MUST be accurate for the published public API.

README content MUST NOT include:

- Undocumented exports or examples that require private internals.
- Stale TODOs, roadmap promises, or speculative features.
- Marketing copy that does not help usage.
- Long implementation explanations better kept in code or package-level `.docs/`.
- Secrets, private URLs, credentials, or environment-specific local paths.

Examples MUST be small, copyable, and realistic. Prefer complete snippets over fragments when missing context would confuse users.

If an example omits setup for brevity, the omission MUST be obvious or stated.

Observable failure behavior SHOULD be stated near the relevant usage or reference material when it affects how consumers call, configure, recover from, or depend on the package.

## Exceptions

Deprecated packages MUST state they are deprecated near the top and point to the replacement when one exists.

Experimental packages MUST state what is unstable: API shape, behavior, build output, or support level.
