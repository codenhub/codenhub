# @codenhub/skills

Zero-dependency interactive CLI tool to install and update AI agent skills across multiple workspace and global harnesses.

## Installation

```sh
pnpm add @codenhub/skills
```

## CLI Usage

Run the CLI tool directly using your package runner:

```sh
npx @codenhub/skills
```

Or with `pnpm`:

```sh
pnpm dlx @codenhub/skills
```

### Interactive UI

By default, the CLI scans the available skills and prompts you to select:

1. **Which skills to install**: Checkbox list of all packaged skills (pre-selected).
2. **Which harnesses to target**: Checkbox list of all supported global and local workspaces (pre-selected).

### Non-Interactive Fallback

If run in a non-interactive terminal (e.g., CI/CD or scripting pipeline), the CLI automatically installs all available skills to all detected harnesses on your system without waiting for input.

## Harness Support

The CLI supports copying custom instructions to both Global and Workspace directories for the following AI agent harnesses:

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
