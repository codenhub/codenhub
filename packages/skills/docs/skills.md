---
title: Skills
---

# Skill Format And Catalog

The `skills/` tree is shipped product content. Its Markdown files are executable instructions and supporting material consumed by agent harnesses, not canonical package-documentation pages. The package documentation describes how those assets are discovered and installed without republishing every skill body.

## Supported Format

Each skill occupies one immediate child directory under a source skills directory and must contain `SKILL.md` with that exact casing:

```text
skills/
  example-skill/
    SKILL.md
    NOTICE
    agents/
    references/
    scripts/
    assets/
```

The programmatic discovery API recognizes the directory solely by the presence of `SKILL.md`. The installer copies the whole directory subject to its harness-specific `agents` exclusion.

The supported metadata is a flat frontmatter block at the beginning of `SKILL.md`:

```markdown
---
name: example-skill
description: Use when an agent needs the example workflow.
---
```

`name` and `description` are the fields consumed by current package tooling. `name` falls back to the directory ID, and `description` falls back to an empty string. The parser is intentionally narrower than YAML; see the [programmatic API](api.md#parsefrontmatter) for exact parsing rules.

Supporting Markdown, YAML, notices, examples, and reference files may accompany `SKILL.md`. Their meaning is harness- or skill-specific and is not interpreted by the package.

## Quality Rules

Bundled skills follow the [Agent Skills specification](https://agentskills.io/specification) and the authoring guidance in the bundled `writing-skills` skill. The package test suite enforces the rules that can be checked mechanically, so `pnpm test skills` fails when a bundled skill breaks one:

- `name` matches the directory, uses lowercase letters, digits, and single hyphens, is at most 64 characters, and contains neither `anthropic` nor `claude`.
- `description` is a single line of 1 to 1024 characters without XML tags.
- Frontmatter uses only the specification's keys: `name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools`.
- The `SKILL.md` body is under 500 lines.
- A skill holds only `SKILL.md`, `NOTICE`, `LICENSE`, `agents/`, `references/`, `scripts/`, and `assets/`.
- Files that `SKILL.md` references exist and use forward slashes, and every file in `references/` is referenced from `SKILL.md`.
- Reference files do not reference other files in the skill, and those over 100 lines open with a `## Contents` section.
- `agents/openai.yaml` defines `display_name`, `short_description`, and `default_prompt`.

The rest of the authoring guidance, such as how a description is phrased or whether a change was evaluated, needs judgment and is covered in review. Drafts are checked for valid metadata only.

## Bundled Inventory

| Skill ID                  | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `agents-md-improver`      | Audits and improves repository `AGENTS.md` guidance.           |
| `audit`                   | Audits and reviews code, classifying findings consistently.    |
| `brainstorming`           | Explores requirements and design before implementation.        |
| `caveman`                 | Provides an ultra-compressed communication mode.               |
| `caveman-commit`          | Generates terse Conventional Commit messages.                  |
| `frontend-design`         | Guides distinctive production-grade frontend design.           |
| `ponytail`                | Builds the simplest solution that works, nothing speculative.  |
| `ponytail-review`         | Finds over-engineering and ledgers deferred work.              |
| `subagent-specialist`     | Plans, delegates, reviews, and integrates parallel agent work. |
| `test-driven-development` | Applies fail-first red-green-refactor development.             |
| `writing-skills`          | Authors, reviews, and evaluates skills against the rules.      |

Skill wording and support files may change while the package is experimental. Use the installed `SKILL.md` and accompanying assets as the authoritative skill content for the installed package version.

## Drafts

Skills still in development live in `drafts/` in the repository, in the same format. They are not published, not listed here, and not installed unless the CLI is run from a checkout with `--include-drafts` (see the [CLI guide](cli.md#draft-skills)). Promoting a draft means moving its directory to `skills/` and adding it to this inventory and to [Skill provenance](provenance.md).

## Third-Party Material

Most bundled skills adapt third-party material. Package and per-skill notices travel with the relevant assets. See [Skill provenance](provenance.md) and the package [NOTICE](../NOTICE) before redistributing or modifying them.
