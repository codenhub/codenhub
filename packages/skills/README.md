# @codenhub/skills

A curated collection of AI agent skills with a built-in installer to configure them across global and local agent harnesses. It also exports a programmatic API to parse skill frontmatter, read available skills, and recursively copy files.

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

## Installation

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

## Usage

The package exports a programmatic API for reading and copying skill directories. The common use case is building a custom skill installer or tooling that discovers and distributes skills.

```ts
import { getSkills, copyRecursiveSync } from "@codenhub/skills";

const skills = getSkills("./skills");

for (const skill of skills) {
  console.log(`Found: ${skill.name} — ${skill.description}`);
  copyRecursiveSync({ src: skill.path, dest: `./output/${skill.id}` });
}
```

## Reference

### `@codenhub/skills`

Core utilities for reading and copying skills.

```ts
import {
  parseFrontmatter,
  getSkills,
  copyRecursiveSync,
  type Skill,
  type CopyRecursiveOptions,
} from "@codenhub/skills";
```

#### parseFrontmatter

Parses YAML frontmatter blocks bounded by `---` from a markdown string. Strips a leading BOM and surrounding single or double quotes from values.

- **Signature**: `parseFrontmatter(content: string): Record<string, string>`
- **Returns**: Key-value map of frontmatter fields. Returns `{}` when no frontmatter is found.

#### getSkills

Reads all valid skills from a directory. A subdirectory is treated as a skill when it contains a `SKILL.md` file.

- **Signature**: `getSkills(srcDir: string): Skill[]`
- **Returns**: Array of [`Skill`](#skill) objects. Returns `[]` when `srcDir` does not exist.

#### copyRecursiveSync

Recursively copies a file or directory to a destination path. Supports an exclusion list filtered by base name.

- **Signature**: `copyRecursiveSync(options: CopyRecursiveOptions): void`
- **Errors**: Throws `Error` when source path does not exist, or target is a subdirectory of source.

#### Skill

Shape of a skill object returned by `getSkills`.

```ts
interface Skill {
  id: string; // Directory name
  name: string; // From SKILL.md frontmatter; falls back to id
  description: string; // From SKILL.md frontmatter
  path: string; // Absolute path to the skill directory
}
```

#### CopyRecursiveOptions

Options accepted by `copyRecursiveSync`.

```ts
interface CopyRecursiveOptions {
  /** Absolute path to the source file or directory. */
  src: string;
  /** Absolute path to the copy destination. */
  dest: string;
  /**
   * Base names to exclude at every depth of the copy tree.
   * Path segments are not supported — only base names.
   */
  ignoreList?: string[];
}
```

### CLI

The package includes a binary installer CLI `codenhub-skills`.

#### Arguments

- `--local`: Install skills to project workspace target directories (default).
- `--global`: Install skills to user home target directories.
- `--both`: Install skills to both global and local directories.
- `--cleanup`: Clean up target directories before copying.
- `--skills=<list>`: Comma-separated list of specific skill IDs to install.
- `--all-skills`: Force-install all available skills.
- `--harnesses=<list>`: Comma-separated list of harnesses to install to.
- `--all-harnesses`: Force-install to all harnesses valid for the selected scope.
- `--help`, `-h`: Display the usage help message.

## Examples

### Read skill metadata from a directory

```ts
import { getSkills } from "@codenhub/skills";

const skills = getSkills("./skills");
skills.forEach((skill) => {
  console.log(`Loaded Skill: ${skill.name} - ${skill.description}`);
});
```

### Copy a skill while excluding a subfolder

```ts
import { copyRecursiveSync } from "@codenhub/skills";

// Copy skill but skip any directory named "agents" at any depth.
copyRecursiveSync({
  src: "./skills/brainstorming",
  dest: "./output/brainstorming",
  ignoreList: ["agents"],
});
```

### Parse frontmatter from a SKILL.md file

```ts
import * as fs from "fs";
import { parseFrontmatter } from "@codenhub/skills";

const content = fs.readFileSync("./skills/brainstorming/SKILL.md", "utf8");
const meta = parseFrontmatter(content);
console.log(meta.name, meta.description);
```

## Requirements

- **Runtime**: Node.js v18.0.0 or higher.
- **TTY**: The built-in installer uses interactive prompts that require a TTY-enabled stdin/stdout connection. Non-interactive environments fall back safely to installing all skills without prompting.

## Notes

- Skill provenance and third-party attribution status are tracked in [docs/provenance.md](docs/provenance.md). Package-level notices live in [NOTICE](NOTICE), and copied or adapted skills may also include per-skill `NOTICE` files.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

It includes adapted third-party skills from upstream sources (Anthropic, Jesse Vincent, and Julius Brussee). See the [NOTICE](NOTICE) file for details.
