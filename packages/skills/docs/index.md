---
title: Overview
description: Choose agent skills and install them in the right folders for your tools.
---

# Install and manage agent skills

Each agent tool expects skills in particular folders. Using several tools can mean copying the same skill directories into each project and into your home directory, then repeating the work when they change. `@codenhub/skills` gives you a curated collection and an installer that puts your choices in those folders. The folder names can remain someone else's hobby.

An agent harness is the application that runs an agent, such as Claude or Codex. A skill gives that agent instructions for a particular kind of work. This collection covers planning, coding, review, design, branding, writing, and maintaining agent guidance. You can install just the skills you need; each is packaged with its supporting files and any required notices.

These docs follow a project using Claude and Codex. We start with `brainstorming` to clarify a change before implementation and `test-driven-development` to implement it with tests, then install the same pair globally for use across projects.

## Quick start

With Node.js 24 or newer, open an interactive terminal in your project directory and run:

```sh
pnpm dlx @codenhub/skills@latest
```

The npm equivalent is `npx @codenhub/skills@latest`. Neither command adds a dependency to your project.

In the wizard, choose local scope, decline the all-skills option, select `brainstorming` and `test-driven-development`, and choose `Claude Workspace` and `Codex Workspace`. Leave cleanup off to keep other installed skills. The installer copies the selected directories into `.claude/skills` and `.agents/skills` under the current directory.

To make the same selection without prompts:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

Any argument except `--include-drafts` switches off the wizard. Without arguments outside an interactive terminal, the installer selects all bundled skills and detected local harnesses. The [CLI guide](cli.md#modes) explains detection and how to choose destinations explicitly.

## Before installing

You need filesystem permission to read the bundled skills and write to every selected destination. Review the skills you install: they contain instructions an agent may follow and may include scripts. The installer copies files; your harness determines how to load and use them. There are no supported programmatic library imports.

Existing files at matching paths are overwritten, directories are merged, and stale files remain. Installation has no rollback. The optional `--cleanup` removes the entire selected skills folder, including skills from other sources. Read [Security and failures](security-and-failures.md) before using cleanup or updating customized installations.

## Reading path

1. [Bundled skills](skills.md): choose workflows, understand what a skill contains, and learn the format, quality rules, and versioning policy.
2. [CLI installer](cli.md): install the pair for Claude and Codex, repeat it globally, and learn all options, destinations, and harness differences.
3. [Security and failures](security-and-failures.md): understand what an update can overwrite, diagnose a partial install, and interpret exit codes.
4. [Skill provenance](provenance.md): check origins, licenses, and the notices to preserve when sharing installed skills.

The [changelog](changelog/index.md) records release changes. The installed `SKILL.md` and its accompanying files describe the workflows for the version you installed.

Start with [Bundled skills](skills.md) to decide which ones belong in your project.
