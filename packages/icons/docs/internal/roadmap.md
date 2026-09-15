---
status: DRAFT
last_updated: 2026-09-15
scope: `@codenhub/icons` direction and open questions.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/icons` that does not yet belong in the root `docs/roadmap.md`. [Registry architecture](./registry-architecture.md) owns the current design.

## Later / Possible

- **CSS-mode unresolved-icon-class warning.** Worth doing; the open question is where it would be raised from, since the scan sees classes one module at a time and never knows the set is complete.
- **`.md` / `.mdx` icon rewriting** in an Astro host. An integration working on the emitted HTML at `astro:build:done` would cover them, at the cost of a new public entrypoint and of missing per-request output — not obviously worth it yet.

## References

- [Registry architecture](./registry-architecture.md)
- `docs/roadmap.md` — repo-wide roadmap; per-package feature work for this package is tracked there.
