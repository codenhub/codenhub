---
status: DRAFT
last_updated: 2026-10-18
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
- Promote `delegate-work` scoped to external CLI workers only. Native subagent delegation belongs to `subagent-specialist`, which took over the draft's harness-independent guidance; two skills that both match "delegate this to subagents" would load unpredictably.
- Add a `writing-functions` skill for general-purpose function design in any language, written against observed failures and evaluated before release.
