---
status: DRAFT
last_updated: 2026-07-16
scope: `@codenhub/components` framework integrations and component library direction.
---

# Roadmap

## Purpose

This document records possible maintainer direction for the experimental
package. It is not a commitment to consumer behavior or delivery dates.

## Current focus

- Standardize property and event declarations in the component definition API.
- Improve runtime adapters for React, Astro, and Svelte.
- Validate the ready-to-use Light DOM component model through `ChButton`.

## Planned direction

- Explore build-time framework-specific output where runtime wrappers are not a
  good fit.
- Evaluate explicit integration with `@codenhub/styles`.
- Expand the ready-to-use component set after the core contract stabilizes.
- Evaluate shared Shadow DOM theme support without duplicating styles.
