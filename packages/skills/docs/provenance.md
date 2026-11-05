---
title: Provenance
description: Check the origins, licenses, and notices that accompany bundled skills.
order: 4
---

# Skill Provenance

When you install a skill in a project and share it with your team, its attribution needs to travel with it. This page records the origin and license context of the skills shipped by `@codenhub/skills`, so you can check what you are adopting before redistributing or modifying it.

The package-level legal terms are in [NOTICE](../NOTICE). Each adapted skill also carries its attribution and upstream license text in its own directory, in `NOTICE` and, where the license is long, `LICENSE`, so both are copied when the installer copies that skill alone. For our `brainstorming` and `test-driven-development` example, their MIT notices accompany each copy installed for Claude and Codex.

| Skill                     | Origin                                 | License            |
| ------------------------- | -------------------------------------- | ------------------ |
| `agents-md-improver`      | Original Coden Agency work             | Apache-2.0         |
| `audit`                   | Adapted from [JuliusBrussee/caveman]   | MIT and Apache-2.0 |
| `babysit-pr`              | Original Coden Agency work             | Apache-2.0         |
| `brainstorming`           | Adapted from [obra/superpowers]        | MIT                |
| `branding`                | Original Coden Agency work             | Apache-2.0         |
| `caveman`                 | Adapted from [JuliusBrussee/caveman]   | MIT                |
| `caveman-commit`          | Adapted from [JuliusBrussee/caveman]   | MIT                |
| `design`                  | Original Coden Agency work             | Apache-2.0         |
| `logo-design`             | Original Coden Agency work             | Apache-2.0         |
| `motion-graphics`         | Original Coden Agency work             | Apache-2.0         |
| `naming`                  | Original Coden Agency work             | Apache-2.0         |
| `playful-tone`            | Original Coden Agency work             | Apache-2.0         |
| `ponytail`                | Adapted from [DietrichGebert/ponytail] | MIT                |
| `ponytail-review`         | Adapted from [DietrichGebert/ponytail] | MIT                |
| `project-template`        | Original Coden Agency work             | Apache-2.0         |
| `subagent-specialist`     | Adapted from [obra/superpowers]        | MIT                |
| `test-driven-development` | Adapted from [obra/superpowers]        | MIT                |
| `writing-skills`          | Adapted from [obra/superpowers]        | MIT                |

The package `NOTICE` contains the applicable attribution blocks and bundled MIT license text. Preserve the relevant notices and license text when sharing installed directories, and review the license terms before modifying or redistributing them.

Return to [Bundled skills](skills.md) to choose another workflow, or the [CLI installer](cli.md) to install it. Before updating an existing installation, review the [changelog](changelog/index.md) and [overwrite and recovery behavior](security-and-failures.md).

[dietrichgebert/ponytail]: https://github.com/DietrichGebert/ponytail
[juliusbrussee/caveman]: https://github.com/JuliusBrussee/caveman
[obra/superpowers]: https://github.com/obra/superpowers
