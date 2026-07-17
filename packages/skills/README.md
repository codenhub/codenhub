# @codenhub/skills

A curated collection of AI agent skill assets, an installer for supported agent
harnesses, and utilities for discovering and copying skill directories.

> **Experimental:** The CLI workflow, harness support, install destinations, and
> bundled skill content may change as agent skill conventions evolve.

## Installation

Run the installer without adding it to a project:

```sh
pnpm dlx @codenhub/skills@latest
```

The equivalent npm command is `npx @codenhub/skills@latest`.

## Usage

Use the library entrypoint to discover skill directories and copy one into a
destination:

```ts
import { copyRecursiveSync, getSkills } from "@codenhub/skills";

const [skill] = getSkills("./skills");

if (skill) {
  copyRecursiveSync({ src: skill.path, dest: `./output/${skill.id}` });
}
```

The CLI is interactive only when invoked without arguments in a TTY. Before
using `--cleanup`, review its destructive behavior in the
[CLI guide](docs/cli.md#destructive-cleanup).

## Documentation

- [Documentation overview](docs/index.md): Complete package documentation.
- [Programmatic API](docs/api.md): Public exports, path rules, and failures.
- [CLI installer](docs/cli.md): Options, destinations, and harness behavior.
- [Skill format and catalog](docs/skills.md): Supported assets and bundled
  inventory.

## Requirements

- Node.js 18.0.0 or newer.
- Filesystem permission to read source skills and modify selected destinations.
- A TTY for the interactive wizard; explicit CLI options support automation.

## Notes

- Existing files are merged and overwritten by default; stale files are not
  removed unless `--cleanup` is used.
- `--cleanup` recursively removes each selected harness's entire skills
  directory before installation.

## License

Licensed under Apache-2.0. Bundled skills include adapted third-party
material; see [NOTICE](NOTICE) and [skill provenance](docs/provenance.md).
