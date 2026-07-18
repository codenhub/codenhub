---
title: CLI
---

# CLI Installer

The `codenhub-skills` executable copies bundled skill directories into supported
agent harness locations. Run it through a package executor:

```sh
pnpm dlx @codenhub/skills@latest
```

Use `npx @codenhub/skills@latest` for the npm equivalent. Node.js 18.0.0 or newer
is required.

## Modes

With no arguments and a TTY, the CLI opens a wizard for scope, skills,
harnesses, and cleanup. Existing harness paths are preselected, but the user can
change the selection.

When stdin is not a TTY, or when any argument is supplied, the CLI does not
prompt. It installs all skills unless `--skills` selects a subset. Without an
explicit harness selection, it installs to harnesses detected for the selected
scope. Detection succeeds when the destination or its parent directory exists.
If none are detected, the command fails rather than writing to every possible
destination; use `--all-harnesses` to opt into all destinations.

## Options

| Option               | Behavior                                                               |
| -------------------- | ---------------------------------------------------------------------- |
| `--local`            | Use workspace destinations. This is the default scope.                 |
| `--global`           | Use destinations under the current user's home directory.              |
| `--both`             | Include both workspace and global destinations.                        |
| `--skills=<list>`    | Install comma-separated, case-sensitive skill IDs.                     |
| `--all-skills`       | Install every bundled skill.                                           |
| `--harnesses=<list>` | Install to comma-separated harness labels, matched case-insensitively. |
| `--all-harnesses`    | Select every harness valid for the chosen scope.                       |
| `--cleanup`          | Remove selected destination roots before copying.                      |
| `--help`, `-h`       | Print command help.                                                    |

Harness labels include their scope, for example `OpenCode Workspace` and
`OpenCode Global`. A label supplied to `--harnesses` must be valid for the
selected scope.

## Install Destinations

Workspace paths resolve from the process's current working directory. Global
paths resolve from the current user's home directory.

| Harness     | Workspace destination | Global destination          |
| ----------- | --------------------- | --------------------------- |
| Antigravity | `.agents/skills`      | `~/.gemini/config/skills`   |
| OpenCode    | `.opencode/skills`    | `~/.config/opencode/skills` |
| Claude      | `.claude/skills`      | `~/.claude/skills`          |
| Codex       | `.codex/skills`       | `~/.codex/skills`           |

The installer creates a child directory named after each skill ID. By default,
it merges into existing directories and overwrites files with matching paths;
it does not remove stale files.

## Harness Behavior

Codex receives the complete bundled skill directory, including an `agents`
directory when a skill has one. Every non-Codex destination excludes entries
whose base name is exactly `agents` at any depth. Other references, examples,
notices, and supporting files are copied unchanged.

The package does not validate that a harness can interpret every bundled file.
Harness conventions and bundled skill contents are part of the package's
experimental surface.

## Destructive Cleanup

`--cleanup` recursively removes each selected harness's entire skills
destination before installation. This deletes all content in that directory,
including skills and files not managed by `@codenhub/skills`. For example,
selecting `OpenCode Workspace` removes `.opencode/skills` as a whole.

Cleanup occurs before any skill is copied. A cleanup failure is printed and the
installer continues, so the affected destination may contain a mixture of old
and newly copied content. Do not use this option on a shared or manually managed
skills directory without a backup.

## Automation Example

Install two skills into every workspace harness without prompts:

```sh
pnpm dlx @codenhub/skills@latest --local --all-harnesses --skills=brainstorming,test-driven-development
```

For validation errors, cancellation codes, partial writes, and filesystem
failures, see [Security and failure behavior](security-and-failures.md).
