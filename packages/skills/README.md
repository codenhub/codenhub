# @codenhub/skills

A curated collection of AI agent skills with a built-in installer to configure them across global and local agent harnesses.

## Included Skills

The package includes the following custom AI agent skills:

- **brainstorming**: Collaborative design and requirement exploration before implementation.
- **writing-specs**: Draft validated technical specifications or design documents.
- **writing-plans**: Turn approved specs into detailed step-by-step implementation plans.
- **executing-plans**: Execute plans with verification checkpoints.
- **test-driven-development**: Strict fail-first red-green-refactor TDD.
- **frontend-design**: Design premium, production-grade frontend interfaces.
- **subagent-specialist**: Planning, dispatching, and reviewing subagents.
- **agents-md-improver**: Audit and improve project-scoped `AGENTS.md` guidelines.
- **writing-skills**: Create, test, and validate new reusable skills.
- **caveman**: Speak in a highly technical, ultra-compressed communication mode.
- **caveman-commit**: Generate clean, terse Conventional Commit messages.
- **caveman-review**: Provide ultra-compressed, actionable one-line code review findings.

## How to Install

Run the interactive installer using `pnpm` or `npx` to copy the skills into your desired global or workspace directories:

```sh
pnpm dlx @codenhub/skills@latest
```

Or with `npx`:

```sh
npx @codenhub/skills@latest
```

### Installation Modes

- **Interactive UI**: By default, the installer lists the available skills and target harnesses on your system (such as Antigravity, OpenCode, Claude, Codex) and prompts you to select which ones to install.
- **Non-Interactive Fallback**: In non-interactive environments (e.g., CI/CD pipelines or automated scripts), it automatically installs all available skills to all detected harnesses without prompting.

## Harness Support

The installer supports copying custom instructions to both Global and Workspace directories for the following AI agent harnesses:

| Harness         | Scope     | Path                        |
| --------------- | --------- | --------------------------- |
| **Antigravity** | Global    | `~/.gemini/config/skills`   |
| **Antigravity** | Workspace | `./.agents/skills`          |
| **OpenCode**    | Global    | `~/.config/opencode/skills` |
| **OpenCode**    | Workspace | `./.opencode/skills`        |
| **Claude**      | Global    | `~/.claude/skills`          |
| **Claude**      | Workspace | `./.claude/skills`          |
| **Codex**       | Global    | `~/.codex/skills`           |
| **Codex**       | Workspace | `./.codex/skills`           |

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
