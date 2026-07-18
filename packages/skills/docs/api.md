---
title: API
---

# Programmatic API

Import all public symbols from `@codenhub/skills`:

```ts
import {
  copyRecursiveSync,
  getSkills,
  parseFrontmatter,
  type CopyRecursiveOptions,
  type Skill,
} from "@codenhub/skills";
```

All operations are synchronous and require Node.js 18.0.0 or newer.

## `parseFrontmatter`

```ts
function parseFrontmatter(content: string): Record<string, string>;
```

Parses a limited, flat frontmatter block at the beginning of a Markdown string.
An optional leading byte-order mark is accepted. The opening and closing `---`
delimiters must occupy their own lines.

Each line is split at its first colon. Values remain strings. Matching single or
double quotes are removed, and an unquoted value drops a trailing comment that
starts with whitespace followed by `#`. Nested YAML, arrays, multiline values,
type coercion, escapes, and general YAML syntax are not supported.

It returns an empty object when there is no matching frontmatter block. Lines
without a colon are ignored.

## `getSkills`

```ts
function getSkills(srcDir: string): Skill[];
```

Reads the immediate child directories of `srcDir`. A child is included only when
it contains a file named exactly `SKILL.md`. Other files and nested skills are
ignored.

For each included directory, the function parses `SKILL.md` and returns:

```ts
interface Skill {
  id: string;
  name: string;
  description: string;
  path: string;
}
```

- `id` is the child directory name.
- `name` is frontmatter `name`, falling back to `id` when absent or empty.
- `description` is frontmatter `description`, falling back to an empty string.
- `path` is the path formed by joining `srcDir` and `id`; it is absolute only
  when `srcDir` is absolute.

The function returns an empty array when `srcDir` does not exist. Results follow
the filesystem's directory enumeration order and are not explicitly sorted.
Unreadable directories or files and other filesystem failures throw.

## `copyRecursiveSync`

```ts
interface CopyRecursiveOptions {
  src: string;
  dest: string;
  ignoreList?: string[];
}

function copyRecursiveSync(options: CopyRecursiveOptions): void;
```

Copies one file or a directory tree from `src` to `dest`. Missing destination
directories are created. Existing files at matching paths are overwritten;
existing directories are merged. Entries that exist only at the destination are
left in place.

`ignoreList` contains exact base names to skip at every directory depth. It does
not accept path patterns or globs. Matching uses the platform's JavaScript string
comparison and is case-sensitive.

The copy follows source symlinks that remain within the source tree and copies
their resolved contents. It rejects a symlink that resolves outside the source
tree. It also rejects destinations that resolve to the source itself or inside
the source. See [Security and failure behavior](security-and-failures.md) before
copying untrusted trees.

The function throws when `src` does not exist, a path constraint is violated, or
another filesystem operation fails. It does not roll back files copied before a
failure.
