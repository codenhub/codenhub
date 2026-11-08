---
title: Bundled skills
description: Choose workflows from the catalog and understand skill format, quality, and versioning.
order: 1
---

# Choose your skills

A skill is a folder containing a `SKILL.md` file: instructions that tell an agent when and how to carry out a particular kind of work. It can also include references, scripts, assets, and harness metadata. Installing a skill puts that folder where your agent tool can find it; the harness decides when to load it, and the agent follows its instructions during the task. A skill supplies a workflow, rather than a guarantee about the result.

For our Claude and Codex project, start with `brainstorming` when a feature needs its requirements clarified, then `test-driven-development` when implementation begins. You do not need the whole collection to use that pair. Each skill stands on its own.

## Bundled catalog

The IDs in the first column are the directory names accepted by `--skills`. Choose by the work you want the agent to do:

| Skill ID                  | When the agent uses it                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brainstorming`           | Before implementation, when requirements or behavior need collaborative design.                                                                      |
| `test-driven-development` | When changing code behavior: write a failing test, implement, then refactor.                                                                         |
| `coding`                  | When writing or changing code, to build it with consistent defaults and handle inputs, failures, state, and sibling paths, with tests written first. |
| `ponytail`                | When coding, to choose the simplest working solution and avoid speculative code.                                                                     |
| `audit`                   | When reviewing code, packages, or pull requests for defects, vulnerabilities, contract problems, or readiness to ship.                               |
| `ponytail-review`         | When reviewing complexity, finding code to simplify or delete, or listing deferred work and shortcuts.                                               |
| `babysit-pr`              | When asked to see a GitHub pull request through CI and review, fixing checks and answering reviewers until it can merge.                             |
| `subagent-specialist`     | When work can be delegated: choose tasks, brief workers, review their results, and integrate them.                                                   |
| `agents-md-improver`      | When writing, auditing, or trimming repository agent instructions, including `AGENTS.md` and files that load it.                                     |
| `project-template`        | When creating a project from the shared project template, comparing an existing project with it, or migrating off its old manifest.                  |
| `writing-skills`          | When authoring, reviewing, or fixing agent skills and evaluating whether their instructions work.                                                    |
| `branding`                | When defining brand strategy, voice, messaging, or a visual identity system and its guidelines.                                                      |
| `naming`                  | When generating, researching, comparing, or choosing names, including names in code.                                                                 |
| `design`                  | When building or reviewing visual interfaces, typography, layout, color, accessibility, or interface motion in any medium.                           |
| `logo-design`             | When creating or refining a logo, mark, favicon, or app icon, through SVG files and usage rules.                                                     |
| `motion-graphics`         | When storyboarding, animating, or rendering a video built with web technology.                                                                       |
| `caveman`                 | When the user asks for shorter answers or a compressed communication mode.                                                                           |
| `caveman-commit`          | When writing a commit message or preparing staged changes for a commit, using the project's convention.                                              |
| `playful-tone`            | When the user asks for or agrees to a lighter, humorous tone in docs or other public text.                                                           |

Planning and coding skills cover the path from a proposed change to implementation. Review and delivery skills help inspect that work and move it through a pull request. Creative skills cover the name, identity, interface, and video around a product. The guidance and writing skills help maintain the instructions and text that surround the work. Pick the parts you use; a full collection is optional.

## Skill format

You only need this section when inspecting a bundle or authoring a skill. The `skills/` tree is shipped product content: its instructions and supporting files are read by agent harnesses, rather than published as package-documentation pages.

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

The installer looks only at immediate child directories and recognizes a skill by the presence of `SKILL.md`. It does not search nested folders for more skills. It copies the whole skill directory subject to its [harness-specific `agents` exclusion](cli.md#harness-behavior).

The supported metadata is a flat frontmatter block at the beginning of `SKILL.md`:

```markdown
---
name: example-skill
description: Use when an agent needs the example workflow.
---
```

The installer reads `name` and `description` for the selection screen. The directory name is the skill ID used in commands and destination paths. A missing or empty `name` falls back to that ID; a missing or empty `description` displays no description. Bundled skills must provide both fields under the quality rules below.

Keep those fields on flat `key: value` lines. The installer reads a frontmatter block at the beginning of the file, allowing a leading byte-order mark, with `---` delimiters starting their own lines. It splits each metadata line at its first colon and trims surrounding whitespace. Values remain strings; lines without a colon are ignored, and a repeated key takes its last value. Without a matching block, the installer reads no metadata and uses the fallbacks.

For a value starting with a single or double quote, the installer takes the text up to the next matching quote and strips the quotes; text after that closing quote is ignored. For an unquoted value, whitespace followed by `#` starts a trailing comment. Quote a description containing a literal ` #` to retain it. This is a limited reader, not a full YAML parser: it does not interpret nested structures, arrays, multiline values, type conversions, or escape sequences. In particular, `description: >` or `description: |` displays the indicator instead of the following paragraph. Put the complete description on one line.

Supporting Markdown, YAML, notices, examples, and reference files may accompany `SKILL.md`. Their meaning is harness- or skill-specific and is not interpreted by the package.

## Quality rules

Bundled skills follow the [Agent Skills specification](https://agentskills.io/specification) and the authoring guidance in the bundled `writing-skills` skill. The package test suite enforces the rules that can be checked mechanically, so `pnpm test skills` fails when a bundled skill breaks one:

- `name` matches the directory, uses lowercase letters, digits, and single hyphens, is at most 64 characters, and contains neither `anthropic` nor `claude`.
- `description` is a single line of 1 to 1024 characters, without XML tags or a folded or literal multiline indicator. `name` must also contain no XML tags.
- Frontmatter uses only the specification's keys: `name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools`.
- The `SKILL.md` body is under 500 lines.
- A skill holds only `SKILL.md`, `NOTICE`, `LICENSE`, `agents/`, `references/`, `scripts/`, and `assets/`.
- Files that `SKILL.md` references exist inside the skill and use forward slashes, and every file in `references/` is referenced from `SKILL.md`.
- Reference files do not reference other files in the skill, and those over 100 lines open with a `## Contents` section.
- A skill's Markdown files do not name another bundled skill, since the user may not have it installed.
- `agents/openai.yaml` defines `display_name`, `short_description`, and `default_prompt`.

The rest of the authoring guidance, such as how a description is phrased or whether a change was evaluated, needs judgment and is covered in review. Drafts are checked for valid metadata only.

## Versioning

From 1.0, the version of a release says what changes for someone who has the skills installed:

- **Major:** a skill is removed or renamed. A skill ID is the directory the installer writes, and the installer leaves an old directory in place, so a removed or renamed skill stays installed until someone deletes it.
- **Minor:** a skill is added, or an existing skill's triggers, rules, or workflow change.
- **Patch:** editorial changes to a skill, such as wording, formatting, or links, with no intended change in behavior.

The CLI follows SemVer as usual. Rejected: treating every change to a skill's behavior as breaking. Nearly every skill change alters what an agent does, so that rule would make almost every release a major one, and the version would no longer tell consumers which upgrades need their attention.

Use the installed `SKILL.md` and accompanying assets as the authoritative skill content for the installed package version.

## Drafts

Skills still in development live in `drafts/` in the repository, in the same format. They are not published, not listed here, and not installed unless the CLI is run from a checkout with `--include-drafts` (see the [CLI guide](cli.md#draft-skills)). Promoting a draft means moving its directory to `skills/` and adding it to this inventory and to [Skill provenance](provenance.md).

## Third-party material

Several bundled skills adapt third-party material; the provenance table lists which. Package and per-skill notices travel with the relevant assets. See [Skill provenance](provenance.md) and the package [NOTICE](../NOTICE) before redistributing or modifying them.

Next, use the [CLI installer](cli.md) to put your chosen skills in the project folders Claude and Codex read.
