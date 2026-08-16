---
status: APPROVED
last_updated: 2026-08-16
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for
`@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns
the styling model itself.

Finished work is not tracked here. The current token contract, component
coverage, and shipped aesthetics belong in the model and repository history,
not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the
supported machine-readable surface, and the public documentation owns the
consumer contract under `docs/specs/packages-documentation.md`. This roadmap
adds no support rules.

## Current Focus

**`0.1.0` stabilization.** The immediate focus is to stabilize the internal
source of truth and turn the remaining review and problem findings into a clear,
finite release path.

The existing public docs describe current behavior, but they are not yet an
editorially useful or final consumer guide. A complete consumer-focused,
task-oriented reformulation remains required before `0.1.0` is complete. This is
an internal readiness condition, not a public stability warning; the package
remains active.

## Planned

`0.1.0` is complete when all of these outcomes hold:

- **Internal sources are stable**: [Model](./model.md), `registry.json`, the test
  strategy, roadmap, and applicable package exceptions agree on the current
  contract and release direction.
- **The current review is closed**: every review thread and finding on the
  release PR is resolved, or explicitly dismissed after the relevant behavior or
  document has been verified. This roadmap does not duplicate that finding list.
- **Public docs are final**: README and public docs satisfy
  `docs/specs/packages-readme.md` and `docs/specs/packages-documentation.md`,
  cover every `package.json` export, and match current behavior. Running
  `pnpm generate styles` leaves all derived documentation current.
- **Validation is clean**: `pnpm verify --changed` passes for the release
  candidate.
- **The PR is merge-ready**: all required PR checks are green and the PR is
  mergeable with no unresolved blocking review thread or finding.

## Later / Possible

- **WCAG AA text contrast**: Raise _filled_ success and warning component text
  contrast to WCAG 1.4.3's 4.5:1 threshold for normal text. Their current
  neutral-50 foreground over emerald-600 and amber-600 backgrounds reaches only
  about 3.5:1 and 3.1:1; the browser test currently enforces 3:1.

  The unfilled half of this is done. `box` prints `--intent-strong` rather than
  `--intent-color` wherever a fill is partial, which took soft and bare success
  and warning text from roughly 3.5:1 and 3.1:1 to 7.3:1 and 6.8:1 in light, and
  past 15:1 in dark. What is left is the filled case, where the contrast tone
  sits on the saturated base and neither is free to move without changing what
  the intent looks like.

- **Preview split**: Promote the playground to a demo application and leave a
  minimal fixture playground behind it for tests. Only worth doing once the
  supported surface and consumer documentation are stable, because the two
  applications would otherwise drift. A demo must not show combinations the
  package does not support.

## Notes

Two measurements shaped the material tokens and outlive the change that needed
them, so both live in Architecture rather than here. A no-op `clip-path` or
`backdrop-filter` costs nothing in any baseline engine -- no compositing layer, no
containing block, no stacking context, literal or behind a `var()` fallback --
which is what made the token route possible at all
([The cost of a no-op](./architecture.md#the-cost-of-a-no-op)). And an indirect
token resolves its `var()` references once, on the element that declares it,
which is why a shape pair needs two token slots rather than one
([Indirect tokens resolve once](./architecture.md#indirect-tokens-resolve-once)).

## Versioning

`0.1.0` is the next release. The package stays on `0.x` while the public contract
remains young, so necessary breaking corrections stay explicit and cheap.
Documentation status remains `active`: the package is supported for normal
consumer use, not frozen against future semver-major changes.

## Not Planned

- **Neumorphism**: Its defining trait is a borderless control distinguished only
  by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped
  unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace.
  The package ships no font binary and stays free of network side effects. The
  playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed
  against a real bitmap face; that is preview scaffolding and never ships. A
  substitute needs distinct uppercase and lowercase glyphs and real 400-700
  weights, since components set `font-weight` 500 to 700 and synthetic bold
  smears a bitmap glyph. Silkscreen fails the first requirement: it draws the
  same glyph for both cases, which makes every heading read as shouting and hides
  real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper
  are not planned. The package stays CSS-only.
- **Public JavaScript behavior**: Toast dismissal, focus management, and
  app-level theme state remain outside this package.

## References

- [Model](./model.md)
- [Architecture](./architecture.md) -- superseded, kept for its measurements
- [Overview](../index.md)
- [Tokens](../tokens.md)
- [Classes](../classes.md)
- [Accessibility](../accessibility.md)
- [Tests](./tests.md)
