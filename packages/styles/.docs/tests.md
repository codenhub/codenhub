# Styles Test Strategy

**Status:** APPROVED
**Last updated:** 2026-06-09
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
    vanilla/
    build/
    browser/
```

## `tests/vanilla`

Manual preview for compiled CSS consumers.

Use built package CSS only:

```css
@import "../../dist/index.css";
```

Cover:

- Tokens in light and dark mode.
- Typography utilities.
- Buttons: variants, disabled, loading.
- Cards, inputs, tooltips, sections.
- Selection and base styles.

Purpose: confirm canonical `@codenhub/styles` output looks right with no Tailwind consumer build.

## `tests/build`

Build validation for Tailwind consumers.

Use source entrypoint:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./index.html";
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
  "test:visual": "playwright test"
}
```

## Priority

1. Add `tests/vanilla` for compiled CSS preview.
2. Add `tests/build` for Tailwind source build validation.
3. Add `tests/browser` for Playwright cross-browser validation.
