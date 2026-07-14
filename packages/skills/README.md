# @codenhub/skills

A curated collection of AI agent skills with a built-in installer to configure them across global and local agent harnesses. It also exports programmatic APIs to parse frontmatter, read available skills, recursively copy files, and prompt users in TTY environments.

## Included Skills

The package includes the following custom AI agent skills:

- **brainstorming**: Collaborative design and requirement exploration before implementation.
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

## Reference

The programmatic API is exported from the package root:

```ts
import {
  parseFrontmatter,
  getSkills,
  copyRecursiveSync,
  confirmPrompt,
  selectPrompt,
  checkboxPrompt,
  type Skill,
  type Choice,
  type SelectChoice,
} from "@codenhub/skills";
```

### Programmatic Functions

#### [parseFrontmatter](file:///c:/Users/gustavo/projects/codenhub/packages/skills/src/index.ts#L48)

Parses YAML frontmatter blocks bounded by `---` from a markdown file string. Automatically strips surrounding single and double quotes from parsed values.

- **Signature**: `parseFrontmatter(content: string): Record<string, string>`
- **Returns**: Key-value mapping of metadata attributes.

#### [getSkills](file:///c:/Users/gustavo/projects/codenhub/packages/skills/src/index.ts#L70)

Reads and gathers all valid skills defined within a target directory. A subdirectory is treated as a valid skill if it contains a `SKILL.md` file.

- **Signature**: `getSkills(srcDir: string): Skill[]`
- **Returns**: Array of [Skill](file:///c:/Users/gustavo/projects/codenhub/packages/skills/src/index.ts#L5) objects.

#### [copyRecursiveSync](file:///c:/Users/gustavo/projects/codenhub/packages/skills/src/index.ts#L102)

Recursively copies files and directories. Supports an exclusion filter list.

- **Signature**: `copyRecursiveSync(src: string, dest: string, ignoreList?: string[]): void`
- **Errors**: Throws if `src` path does not exist.

#### [confirmPrompt](file:///c:/Users/gustavo/projects/codenhub/packages/skills/src/index.ts#L225)

Prompts user with a yes/no option in TTY terminal environments.

- **Signature**: `confirmPrompt(message: string, options: ConfirmOptions): Promise<boolean | "__BACK__">`

#### [selectPrompt](file:///c:/Users/gustavo/projects/codenhub/packages/skills/src/index.ts#L249)

Prompts user with a single selection menu in TTY terminal environments.

- **Signature**: `selectPrompt(message: string, options: SelectOptions): Promise<string>`

#### [checkboxPrompt](file:///c:/Users/gustavo/projects/codenhub/packages/skills/src/index.ts#L127)

Prompts user with a multi-selection checkbox menu in TTY terminal environments.

- **Signature**: `checkboxPrompt(message: string, options: CheckboxOptions): Promise<string[] | "__BACK__">`

## Examples

### Read Skills metadata from a directory

```ts
import { getSkills } from "@codenhub/skills";

const skills = getSkills("./skills");
skills.forEach((skill) => {
  console.log(`Loaded Skill: ${skill.name} - ${skill.description}`);
});
```

### Prompt for a Yes/No option

```ts
import { confirmPrompt } from "@codenhub/skills";

const installAll = await confirmPrompt("Install all skills?", {
  defaultValue: true,
  canGoBack: false,
});

console.log("Response:", installAll);
```

## Requirements

- **Runtime**: Node.js v18.0.0 or higher.
- **TTY**: Interactive prompts require a TTY-enabled stdout/stdin connection. Non-interactive environments fallback safely.

## Notes

- Skill provenance and third-party attribution status are tracked in [docs/provenance.md](docs/provenance.md). Package-level notices live in [NOTICE](NOTICE), and copied or adapted skills may also include per-skill `NOTICE` files.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
