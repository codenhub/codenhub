---
status: DRAFT
last_updated: 2026-11-22
scope: `@codenhub/icons` direction and open questions.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/icons` that does not yet belong in the root `docs/roadmap.md`. [Registry architecture](./registry-architecture.md) owns the current design.

## Direction

- **A build tool is an adapter, not the path.** `@codenhub/icons` works the same in a project that runs no build tool at all: `chi build` writes the icons a project's files use, and the Tailwind CSS, Vite, and PostCSS plugins are adapters for projects that already run one, never a requirement. This follows the direction `@codenhub/styles` records in [A build the package owns](../../../styles/docs/internal/roadmap.md#a-build-the-package-owns-with-tailwind-as-an-adapter), and the adapter rule of [Few dependencies](../../../../docs/guidelines/code.md#few-dependencies). Rejected: the Tailwind plugin as the main route, with `chi build` a fallback, which ties what a project without Tailwind gets to a tool it does not run.

## Planned

- **A first-party icon family** that owns the semantic names.

## Later / Possible

- **CSS-mode unresolved-icon-class warning in the plugins.** Worth doing; the open question is where it would be raised from, since the scan sees classes one module at a time and never knows the set is complete. `chi build` reads every file before it writes, so it warns, as [Build command](./cli.md#classes-that-resolve-to-no-icon) records.
- **`.md` / `.mdx` icon rewriting** in an Astro host. An integration working on the emitted HTML at `astro:build:done` would cover them, at the cost of a new public entrypoint and of missing per-request output — not obviously worth it yet.

## References

- [Registry architecture](./registry-architecture.md)
- `docs/roadmap.md` — repo-wide roadmap.
