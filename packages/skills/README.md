# @codenhub/skills

A curated set of agent skills and a CLI that installs them into the right folders for your agent tools. Choose the workflows you want, then install them in a project, in your home directory, or both.

## Installation

Run the installer without adding it to a project:

```sh
pnpm dlx @codenhub/skills@latest
```

Or use npm:

```sh
npx @codenhub/skills@latest
```

## Usage

Run the command from your project directory. In an interactive terminal, the wizard asks where to install, whether to include all skills or choose a subset, which agent harnesses to target, and whether to clean their skills folders first. Cleanup is off by default.

For a repeatable install without prompts, select skills and destinations explicitly:

```sh
pnpm dlx @codenhub/skills@latest --local --skills=brainstorming,test-driven-development --harnesses="Claude Workspace,Codex Workspace"
```

The collection covers planning and implementation (`brainstorming`, `test-driven-development`, `coding`, `ponytail`), review and delivery (`audit`, `babysit-pr`), creative work (`branding`, `design`, `logo-design`, `motion-graphics`, `naming`), and agent guidance and writing. See the [skill catalog](docs/skills.md) for every skill and when it applies.

## Documentation

- [Documentation overview](docs/index.md): Complete package documentation.
- [Bundled skills](docs/skills.md): Choose skills and understand their format and versioning.
- [CLI installer](docs/cli.md): Options, destinations, and harness behavior.
- [Security and failures](docs/security-and-failures.md): Cleanup risks, partial installs, and recovery.
- [Changelog](docs/changelog/index.md): Release history.

## Requirements

- Node.js 24 or newer.
- Filesystem permission to read source skills and modify selected destinations.
- An interactive terminal (TTY) for the wizard; explicit CLI options support automation.

## Notes

- Existing files are merged and overwritten by default; stale files are not removed unless `--cleanup` is used.
- `--cleanup` recursively removes each selected harness's entire skills directory before installation.
- Installation writes directly to disk without rollback. Back up customized skills before updating; see [failure behavior](docs/security-and-failures.md).
- The package provides an installer CLI, with no supported programmatic library imports.

## License

Licensed under Apache-2.0. Bundled skills include adapted third-party material; see [NOTICE](NOTICE) and [skill provenance](docs/provenance.md).
