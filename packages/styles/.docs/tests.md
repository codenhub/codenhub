# Styles Test Strategy

**Status:** APPROVED
**Last updated:** 2026-06-12
**Scope:** `@codenhub/styles` package test strategy.

## Goal

Validate `@codenhub/styles` before publishing changes across both supported consumer paths:

- Ready-to-import compiled CSS.
- Tailwind CSS build-time source CSS.

Keep tests package-local and focused on visual confidence plus build compatibility.

## Structure

```text
packages/styles/
  tests/
    preview/
    vanilla/
    build/
    browser/
  scripts/
```

## `tests/preview`

Shared manual and automated preview page for both supported consumer paths.

Open with one of these URLs when running the package dev server:

```text
http://localhost:5173/tests/preview/index.html?env=vanilla
http://localhost:5173/tests/preview/index.html?env=build
```

The page loads `tests/vanilla/output.css` for `env=vanilla` and `tests/build/output.css` for `env=build`.

Cover:

- Tokens in light and dark mode.
- Typography utilities.
- Buttons: intent, presentation, disabled, and loading states.
- Layout helpers, surfaces, forms, feedback, tooltips, and sections.
- Selection and base styles.
- Tailwind token utilities, dark variants, and responsive variants.

Purpose: keep one HTML fixture while validating both real CSS outputs.

## `tests/vanilla`

Compiled CSS output for vanilla consumers.

Use built package CSS only:

```css
@import "../../dist/index.css";
```

Purpose: confirm canonical `@codenhub/styles` output looks right with no Tailwind consumer build.

## `tests/build`

Build validation for Tailwind consumers.

Use source entrypoint:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "../preview/index.html";
```

Cover:

- Tailwind can process package source.
- Token utilities work, such as `bg-background`, `text-text`, `font-default`.
- Dark variant works with `.dark`.
- Component classes build correctly.
- Responsive token variants work.

Purpose: confirm `@codenhub/styles/tw` works in consumer Tailwind builds.

## `tests/browser`

Cross-browser automation for visual and computed-style confidence.

Use Playwright by default.

Tests load the same preview page twice with different `env` query values.

Cover:

- Chromium.
- Firefox.
- WebKit.
- Page load assertions.
- Key computed style assertions.
- Optional screenshots for visual review.

Purpose: catch browser-specific CSS regressions before publishing changes.

## Scripts

Default package checks:

```json
{
  "test": "pnpm typecheck && pnpm test:build && pnpm test:visual",
  "test:build": "pnpm build && pnpm test:build:vanilla && pnpm test:build:tw",
  "test:visual": "playwright test",
  "dev": "node ./scripts/dev.js"
}
```

`pnpm dev` starts a local static server and watches both CSS test builds.

## Priority

1. Keep `tests/preview` as the single shared HTML fixture.
2. Keep `tests/vanilla` for compiled CSS output.
3. Keep `tests/build` for Tailwind source build validation.
4. Keep `tests/browser` for Playwright cross-browser validation.
