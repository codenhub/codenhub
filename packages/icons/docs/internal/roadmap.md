---
status: DRAFT
last_updated: 2026-11-16
scope: `@codenhub/icons` direction and open questions.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/icons` that does not yet belong in the root `docs/roadmap.md`. [Registry architecture](./registry-architecture.md) owns the current design.

## Planned

- **A first-party icon family** that owns the semantic names.
- **`chi build`, in 0.4.0.** Icons trimmed to a project's files without Tailwind CSS, Vite, or PostCSS, on a scanner shared with `@codenhub/styles`. [Build command](./cli.md) records the design.

## Later / Possible

- **CSS-mode unresolved-icon-class warning in the plugins.** Worth doing; the open question is where it would be raised from, since the scan sees classes one module at a time and never knows the set is complete. `chi build` reads every file before it writes, so it warns, as [Build command](./cli.md#classes-that-resolve-to-no-icon) records.
- **`.md` / `.mdx` icon rewriting** in an Astro host. An integration working on the emitted HTML at `astro:build:done` would cover them, at the cost of a new public entrypoint and of missing per-request output — not obviously worth it yet.

## References

- [Registry architecture](./registry-architecture.md)
- `docs/roadmap.md` — repo-wide roadmap.
