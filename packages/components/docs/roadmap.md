# Roadmap

**Status:** DRAFT  
**Last updated:** 2026-07-14  
**Scope:** `@codenhub/components` package framework integrations and component library expansion.

## Purpose

To transition `@codenhub/components` from a native Web Component core wrapper into a multi-framework-optimized component library supporting React, Astro, and Svelte.

## Current Focus

- **Core Metadata Enhancements**: Standardize property and event declarations in the component definition API.
- **Runtime Wrappers**: Provide dynamic runtime adapters to bind properties and map custom events for React, Astro, and Svelte.
- **Proof-of-Concept Components**: Deliver basic ready-to-use Light DOM components like `ChButton`.

## Planned

- **Framework Compiler Engine**: A build-time compiler that parses the core component definitions and template declarations, outputting fully optimized native components tailored for each target framework (e.g. React virtual DOM nodes, compiled Svelte components, or Astro components) to bypass standard custom element overhead and handle framework-specific quirks.
- **Styles Integration**: Seamless injection/loading of component styles from `@codenhub/styles`.
- **Additional Ready-to-Use Components**: Add `ChInput`, `ChDialog` / `ChModal`, and form validation helpers.

## Later / Possible

- **Shadow DOM Shared Theme Support**: Enable constructable stylesheets mapping global tokens into shadow roots without bundle duplication.

## References

- [Package lifecycle specification](../../../docs/specs/packages-lifecycle.md)
- [Design proposal](../../../brain/26ef8e83-c3b4-453c-9bbb-6967b5c25e88/design_proposal.md)
