---
title: CLI installer
description: Install selected skills locally or globally, choose harness destinations, and automate updates.
order: 2
---

# Install skills in your agent tools

Once you have [chosen skills](skills.md), the installer copies their folders into the locations your agent tools read. This guide installs `brainstorming` and `test-driven-development` for Claude and Codex in one project, then makes the same pair available globally.

The executable is named `codenhub-skills`. Run it without adding a project dependency through a package executor:

```sh
pnpm dlx @codenhub/skills@latest
```

Use `npx @codenhub/skills@latest` for the npm equivalent. Node.js 24 or newer is required.

## Start in a project

Open a terminal in the repository directory where you want the skills. Local paths are relative to the current directory, so running from a subdirectory installs there; the installer does not search upward for a repository root.

Run the command above in an interactive terminal, then:

1. Choose **Locally (project workspace)**, the default scope.
2. Answer **No** to installing all skills. The default is **Yes**; declining opens the individual selection screen, initially with all skills checked.
3. Keep only `brainstorming` and `test-driven-development` selected.
4. Select `Claude Workspace` and `Codex Workspace`, clearing any other checked harnesses.
5. Leave cleanup at its default, **No**, to retain other installed skills.

Use Up and Down to move, Space to toggle checkboxes, and Enter to confirm a step. Backspace or Left returns to the previous step where offered. Ctrl+C cancels the wizard. Once you confirm the cleanup step, installation starts.

Each skill becomes a child directory under `.claude/skills` and `.agents/skills`. For example, Codex receives `.agents/skills/brainstorming/SKILL.md`. Missing destination directories are created. By default, existing directories are merged and matching files are overwritten; files present only at the destination remain. Back up local edits before updating.

The installer copies files and reports the result. Consult your harness's instructions for loading installed skills; the package does not validate that a harness can interpret every bundled file.

## Modes

The wizard appears only when stdin is a TTY (an interactive terminal) and no arguments are supplied, except that `--include-drafts` alone keeps it interactive. Scope, skill selection, harnesses, and cleanup are all choices in the wizard. Detected harness paths are preselected; change that selection before confirming if you want fewer destinations.

When stdin is not a TTY, or any other argument is supplied, the CLI does not prompt. Even `--local` alone starts an install with defaults: all skills, local scope, detected harnesses, and no cleanup. Use explicit selections in scripts so the result does not depend on which folders already exist.

Detection means the destination skills folder or its parent exists; it does not check whether the harness application is installed. For example, an existing `.claude/` directory detects `Claude Workspace` even without `.claude/skills/`. Detection is restricted to the selected scope. If nothing is detected, the command fails. Choose labels with `--harnesses` to create their destinations, or use `--all-harnesses` to opt into every destination in that scope.

## Repeat the selection without prompts

This installs our two skills for Claude and Codex in the current repository, whether or not their folders already exist:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

For the same pair under your home directory, change both the scope and the labels:

```sh
pnpm dlx @codenhub/skills@latest --global --skills=brainstorming,test-driven-development --harnesses="Claude Global,Codex Global"
```

Global scope uses fixed locations under your home directory, regardless of the current project. To do both installs in one run, use `--both` and list all four labels:

```sh
pnpm dlx @codenhub/skills@latest --both --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace,Claude Global,Codex Global"
```

Local and global copies are separate files. Updating one does not update the other. If both are installed, your harness determines how it resolves them.

## Options

| Option               | Behavior                                                                              |
| -------------------- | ------------------------------------------------------------------------------------- |
| `--local`            | Use workspace destinations. This is the default scope.                                |
| `--global`           | Use destinations under the current user's home directory.                             |
| `--both`             | Include both workspace and global destinations.                                       |
| `--skills=<list>`    | Install comma-separated, case-sensitive skill IDs.                                    |
| `--all-skills`       | Install every available skill. This is the default; drafts are included when enabled. |
| `--harnesses=<list>` | Install to comma-separated harness labels, matched case-insensitively.                |
| `--all-harnesses`    | Select every harness valid for the chosen scope.                                      |
| `--cleanup`          | Remove entire selected skills destination roots before copying. Off by default.       |
| `--include-drafts`   | Also offer draft skills. Works only from a repository checkout.                       |
| `--help`, `-h`       | Print command help.                                                                   |

Harness labels include their scope, for example `Claude Workspace` and `Claude Global`. A label supplied to `--harnesses` must be valid for the selected scope. Quote the whole list as shown above to keep labels with spaces in one argument.

Use the `=` form for list options: `--skills=brainstorming`, not `--skills brainstorming`. Lists trim whitespace, ignore empty comma-separated items, and remove repeated identical entries, but must contain at least one item. Unknown skill IDs and invalid harness labels fail before installation.

Prefer one scope option and one selection form per list. If repeated, the last scope option wins, and the last `--skills` or `--harnesses` list replaces earlier lists. `--all-skills` and `--all-harnesses` take precedence over their respective lists, though a syntactically empty list still fails. Unknown arguments fail. The skill sources load first, so a loading failure still exits with status 1, such as `--include-drafts` in the published package, which ships no drafts. After that, `--help` or `-h` takes precedence over every other argument, including unknown or invalid ones: it prints usage and exits with status 0 without installing.

## Install Destinations

Workspace paths resolve from the process's current working directory. Global paths resolve from the current user's home directory. The `Agent Skills` destinations are the cross-harness standard locations (`.agents/skills`) that most harnesses read natively; install there, rather than to a harness's own directory, when the harness reads both.

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

This means selecting both `Agent Skills Workspace` and `Codex Workspace` does not give you two independent installations. They address the same files, so updates or cleanup affect the skills read by every harness using that path.

## Harness Behavior

Destinations selected through a Codex label receive the complete bundled skill directory, including an `agents` directory when a skill has one. Every other destination excludes entries whose base name is exactly `agents` at any depth. When a Codex label shares a destination with other selected labels, the shared copy keeps the `agents` directory. Other references, examples, notices, and supporting files are copied unchanged.

In our example, Codex gets each skill's `agents/openai.yaml` when present; Claude's copy excludes it. Selecting only `Agent Skills Workspace` also excludes `agents` entries, even though Codex reads that destination. Select a Codex label when you want its metadata included. Exclusion skips source entries; it does not delete an `agents` folder left by an earlier install.

## Destructive Cleanup

`--cleanup` recursively removes each selected harness's entire skills destination before installation. This deletes all content in that directory, including skills and files not managed by `@codenhub/skills`. In our local example, adding it removes both `.claude/skills` and `.agents/skills` as whole directories, even though only two skills are selected. Labels that share a destination, such as `Codex Workspace` and `Agent Skills Workspace`, remove that one directory once.

All selected roots are cleaned before any skill is copied. Back up those directories and check the current working directory and selected scope first. To remove a single stale skill, delete its own folder instead of cleaning the whole root.

A cleanup failure is printed and the installer continues copying into that destination, which may leave a mixture of old and new content. Cleanup failure alone does not set a nonzero exit code. Inspect output as well as the exit status when automating cleanup. Copying has no rollback; see [Security and failures](security-and-failures.md) for recovery.

## Draft Skills

Draft skills live in the repository beside the bundled ones, in `packages/skills/drafts/`, and are not published. The installer ignores them unless `--include-drafts` is given, which adds them to the skills it offers, each labeled `(draft)` in the wizard. The flag says where skills come from rather than what to install, so on its own it keeps the wizard; with other options, `--all-skills` and the default selection include the drafts too.

Run it from a checkout after building the package, from the directory to install into:

```sh
pnpm build skills
node "<checkout>/packages/skills/dist/cli.js" --include-drafts
```

Replace `<checkout>` with the path to the repository checkout. The build command runs from that checkout; run the `node` command from the project where the draft skills should be installed.

If no drafts exist, including in a published install, the flag fails with exit code `1`. A draft whose ID matches a bundled skill also fails. Use the published installer without this flag for normal installations.

## Automation Example

To extend our example to every supported workspace harness, replace the explicit harness list with `--all-harnesses`:

```sh
pnpm dlx @codenhub/skills@latest --local --all-harnesses --skills=brainstorming,test-driven-development
```

This creates every local destination in the table, even for tools you do not use. For a controlled setup script, the explicit Claude and Codex selection above is narrower. Pin an exact package version instead of `@latest` when the script must install the same released content on each run.

Next, read [Security and failures](security-and-failures.md) to interpret exit codes and recover when only part of an install succeeds.
