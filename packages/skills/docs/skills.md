# Skill Format And Catalog

The `skills/` tree is shipped product content. Its Markdown files are executable
instructions and supporting material consumed by agent harnesses, not canonical
package-documentation pages. The package documentation describes how those
assets are discovered and installed without republishing every skill body.

## Supported Format

Each skill occupies one immediate child directory under a source skills
directory and must contain `SKILL.md` with that exact casing:

```text
skills/
  example-skill/
    SKILL.md
    NOTICE
    agents/
    references/
```

The programmatic discovery API recognizes the directory solely by the presence
of `SKILL.md`. The installer copies the whole directory subject to its
harness-specific `agents` exclusion.

The supported metadata is a flat frontmatter block at the beginning of
`SKILL.md`:

```markdown
---
name: example-skill
description: Use when an agent needs the example workflow.
---
```

`name` and `description` are the fields consumed by current package tooling.
`name` falls back to the directory ID, and `description` falls back to an empty
string. The parser is intentionally narrower than YAML; see the
[programmatic API](api.md#parsefrontmatter) for exact parsing rules.

Supporting Markdown, YAML, notices, examples, and reference files may accompany
`SKILL.md`. Their meaning is harness- or skill-specific and is not interpreted
by the package.

## Bundled Inventory

| Skill ID                  | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `agents-md-improver`      | Audits and improves repository `AGENTS.md` guidance.           |
| `brainstorming`           | Explores requirements and design before implementation.        |
| `caveman`                 | Provides an ultra-compressed communication mode.               |
| `caveman-commit`          | Generates terse Conventional Commit messages.                  |
| `caveman-review`          | Produces compressed, actionable code-review findings.          |
| `frontend-design`         | Guides distinctive production-grade frontend design.           |
| `subagent-specialist`     | Plans, delegates, reviews, and integrates parallel agent work. |
| `test-driven-development` | Applies fail-first red-green-refactor development.             |
| `writing-skills`          | Creates, reviews, tests, and validates skill bundles.          |

Skill wording and support files may change while the package is experimental.
Use the installed `SKILL.md` and accompanying assets as the authoritative skill
content for the installed package version.

## Third-Party Material

Most bundled skills adapt third-party material. Package and per-skill notices
travel with the relevant assets. See [Skill provenance](provenance.md) and the
package [NOTICE](../NOTICE) before redistributing or modifying them.
