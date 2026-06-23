# Roadmap

**Status:** APPROVED  
**Last updated:** 2026-06-23  
**Scope:** `bubble-plugin` package future roadmap

This document outlines the planned improvements and missing features for the `bubble-plugin` package before reaching version `v0.1.0`. These features are planned for development post-`v0.0.1`.

## Planned Features

### 1. Element Property Initialization

- Support automatic initialization of element properties.
- Provide a mechanism to map Bubble's custom element properties directly to TypeScript class properties or reactive stores, avoiding repetitive manual parsing in the `update` hook.

### 2. Granular Build Error Strategy

- Refactor the strict build errors to be more granular.
- Distinguish between:
  - **Critical Errors (Stop Build)**: Syntax errors, malformed `bubble.json` config, missing essential hook files (if configured), and fatal bundling failures.
  - **Warnings (Proceed with Defaults)**: Non-matching function signatures where defaults can be safely injected, or missing optional fields in configuration.

### 3. Automatic Type Generation

- Generate TypeScript type definitions representing properties and states directly from the `bubble.json` schema.
- This will allow developers to import types like `MyElementProperties` or `MyElementStates` that are kept in sync with the configuration automatically.
