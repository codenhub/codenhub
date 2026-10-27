---
status: DRAFT
last_updated: 2026-10-26
scope: `@codenhub/skills` direction.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/skills`. The repo-wide roadmap is `docs/roadmap.md`.

## Current Focus

- Review and polish custom AI agent skills under `skills/`.
- Maintain licensing, copyright, and attribution notices for shipped assets.

## Planned

- Validate `npx @codenhub/skills@latest` and `pnpm dlx @codenhub/skills@latest` on a clean machine.
- Add more core skill templates.
- Promote `delegate-work` scoped to external CLI workers only, with its description narrowed to match. Native subagent delegation belongs to `subagent-specialist`, which took over the draft's harness-independent guidance; two skills that both match "delegate this to subagents" would load unpredictably.
- Evaluate and promote the design-practice drafts `logo-design`, `motion-graphics`, and `branding`. Interface behavior and interface motion live in `design` as references rather than in a separate UI skill, because a second skill matching "build this screen" would load unpredictably. `motion-graphics` covers video only, requires a time-driven, deterministic render setup rather than a specific tool, and defaults to GSAP with headless-browser frame capture when a project has none.
- Add a `writing-functions` skill for general-purpose function design in any language, written against observed failures and evaluated before release.
