---
title: CLI
---

# CLI Installer

The `codenhub-skills` executable copies bundled skill directories into supported agent harness locations. Run it through a package executor:

```sh
pnpm dlx @codenhub/skills@latest
```

Use `npx @codenhub/skills@latest` for the npm equivalent. Node.js 24 or newer is required.

## Modes

With no arguments and a TTY, the CLI opens a wizard for scope, skills, harnesses, and cleanup. Existing harness paths are preselected, but the user can change the selection.

When stdin is not a TTY, or when any argument other than `--include-drafts` is supplied, the CLI does not prompt. It installs all skills unless `--skills` selects a subset. Without an explicit harness selection, it installs to harnesses detected for the selected scope. Detection succeeds when the destination or its parent directory exists. If none are detected, the command fails rather than writing to every possible destination; use `--all-harnesses` to opt into all destinations.

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
| `--include-drafts`   | Also offer draft skills. Works only from a repository checkout.        |
| `--help`, `-h`       | Print command help.                                                    |

Harness labels include their scope, for example `OpenCode Workspace` and `OpenCode Global`. A label supplied to `--harnesses` must be valid for the selected scope.

## Install Destinations

Workspace paths resolve from the process's current working directory. Global paths resolve from the current user's home directory. The `Agent Skills` destinations are the cross-harness standard locations (`.agents/skills`) that most harnesses read natively; prefer them when a harness appears in both lists.

| Harness      | Workspace destination | Global destination           |
| ------------ | --------------------- | ---------------------------- |
| Agent Skills | `.agents/skills`      | `~/.agents/skills`           |
| Antigravity  | `.agents/skills`      | `~/.gemini/config/skills`    |
| Claude       | `.claude/skills`      | `~/.claude/skills`           |
| Cline        | `.cline/skills`       | `~/.cline/skills`            |
| Codex        | `.agents/skills`      | `~/.agents/skills`           |
| Copilot      | `.github/skills`      | `~/.copilot/skills`          |
| Cursor       | `.cursor/skills`      | `~/.cursor/skills`           |
| Gemini CLI   | `.gemini/skills`      | `~/.gemini/skills`           |
| Kiro         | `.kiro/skills`        | `~/.kiro/skills`             |
| OpenCode     | `.opencode/skills`    | `~/.config/opencode/skills`  |
| Trae         | `.trae/skills`        | `~/.trae/skills`             |
| Windsurf     | `.windsurf/skills`    | `~/.codeium/windsurf/skills` |
| ZCode        | `.zcode/skills`       | `~/.zcode/skills`            |

Several labels resolve to the same directory because the harnesses read it too: `Agent Skills Workspace`, `Antigravity Workspace`, and `Codex Workspace` share `.agents/skills`; `Agent Skills Global` and `Codex Global` share `~/.agents/skills`. Selecting labels that share a destination installs each skill once rather than copying it repeatedly.

The installer creates a child directory named after each skill ID. By default, it merges into existing directories and overwrites files with matching paths; it does not remove stale files.

## Harness Behavior

Destinations selected through a Codex label receive the complete bundled skill directory, including an `agents` directory when a skill has one. Every other destination excludes entries whose base name is exactly `agents` at any depth. When a Codex label shares a destination with other selected labels, the shared copy keeps the `agents` directory. Other references, examples, notices, and supporting files are copied unchanged.

The package does not validate that a harness can interpret every bundled file. Harness conventions and bundled skill contents are part of the package's experimental surface.

## Destructive Cleanup

`--cleanup` recursively removes each selected harness's entire skills destination before installation. This deletes all content in that directory, including skills and files not managed by `@codenhub/skills`. For example, selecting `OpenCode Workspace` removes `.opencode/skills` as a whole. Labels that share a destination, such as `Codex Workspace` and `Agent Skills Workspace`, remove that one directory.

Cleanup occurs before any skill is copied. A cleanup failure is printed and the installer continues, so the affected destination may contain a mixture of old and newly copied content. Do not use this option on a shared or manually managed skills directory without a backup.

## Draft Skills

Draft skills live in the repository beside the bundled ones, in `packages/skills/drafts/`, and are not published. The installer ignores them unless `--include-drafts` is given, which adds them to the skills it offers, each labeled `(draft)` in the wizard. The flag says where skills come from rather than what to install, so on its own it keeps the wizard; with other options, `--all-skills` and the default selection include the drafts too.

Run it from a checkout after building the package, from the directory to install into:

```sh
pnpm build skills
node <checkout>/packages/skills/dist/cli.js --include-drafts
```

From a published install, which has no drafts, the flag fails with exit code `1`. So does a draft whose ID matches a bundled skill.

## Automation Example

Install two skills into every workspace harness without prompts:

```sh
pnpm dlx @codenhub/skills@latest --local --all-harnesses --skills=brainstorming,test-driven-development
```

For validation errors, cancellation codes, partial writes, and filesystem failures, see [Security and failure behavior](security-and-failures.md).
