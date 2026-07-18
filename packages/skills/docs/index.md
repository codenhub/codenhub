---
title: Overview
---

# Install and manage agent skills

`@codenhub/skills` provides a curated collection of AI agent skills, a CLI that
installs them into supported harnesses, and Node.js utilities for discovering
and copying skill directories.

## Setup

### Installation

Run the installer without adding it to a project:

```sh
pnpm dlx @codenhub/skills@latest
```

The npm equivalent is `npx @codenhub/skills@latest`.

### Quick start

Run the command from the workspace where the skills should be installed. With no
arguments in a TTY, the wizard lets you choose scope, skills, harnesses, and
cleanup behavior.

For automation, provide explicit options. This installs two skills into every
supported workspace harness without prompting:

```sh
pnpm dlx @codenhub/skills@latest --local --all-harnesses --skills=brainstorming,test-driven-development
```

Review the [CLI installer](cli.md) before choosing destinations or automating
cleanup.

### Configuration

Use `--local`, `--global`, or `--both` to select scope. Select skills with
`--skills` or `--all-skills`, and destinations with `--harnesses` or
`--all-harnesses`. Without arguments outside a TTY, the CLI installs all skills
to detected harnesses in the local scope and fails if none are detected.

## Requirements

- Node.js 18.0.0 or newer.
- Filesystem permission to read source skills and modify every selected
  destination.
- A TTY for the interactive wizard. Explicit CLI options support automation.

## Filesystem safety

Installation and copying write directly to local filesystem trees and are not
transactional. Existing files are merged and overwritten by default. The
`--cleanup` option first removes each selected harness's entire skills directory,
including content not managed by this package. Cleanup failures do not by
themselves produce a nonzero exit code.

Read [Security and failure behavior](security-and-failures.md) for path and
symlink constraints, partial-write behavior, cleanup risks, and CLI exit
semantics before copying untrusted trees or automating installation.

## Next steps

- [CLI installer](cli.md): Review interactive and automated modes, options,
  destinations, harness behavior, and destructive cleanup.
- [Programmatic API](api.md): Use synchronous parsing, discovery, and recursive
  copy utilities in custom Node.js workflows.
- [Skill format and catalog](skills.md): Evaluate or author compatible
  `SKILL.md` assets and inspect the bundled inventory.
- [Skill provenance](provenance.md): Review origins, licenses, package notices,
  and the per-skill `NOTICE` files copied during installation.
