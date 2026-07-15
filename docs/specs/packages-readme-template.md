# @codenhub/example-package

Replace this paragraph with a short description of the package's public
purpose, intended consumers, and essential default behavior.

Use this file as a concise README scaffold. Keep the main use case here and move
complete reference, advanced workflows, extended examples, troubleshooting, and
migrations into published `docs/`.

## Installation

```sh
pnpm add @codenhub/example-package
npm install @codenhub/example-package
yarn add @codenhub/example-package
bun add @codenhub/example-package
```

Keep the package managers useful to consumers. Omit this section when consumers
never install the package directly.

## Usage

Explain expected default behavior, then show the smallest useful example for the
main use case.

```ts
import { createExampleThing } from "@codenhub/example-package";

const thing = createExampleThing({ id: "example-id" });

thing.run();
```

Add required first-use setup, such as CSS imports, provider setup, plugin
registration, or environment configuration. State critical observable failure
behavior here when it changes safe first use.

## Documentation

- [Getting started](docs/getting-started.md): Package setup and core workflow.
- [Reference](docs/reference.md): Public entrypoints and complete API coverage.
- [Examples](docs/examples.md): Additional consumer workflows.
- [Troubleshooting](docs/troubleshooting.md): Common failures and recovery.

Keep only links that exist. Link directly to useful documents rather than only
to the `docs/` directory. A small API or entrypoint overview MAY appear here when
it helps readers choose a starting path, but do not copy full reference content
into the README.

## Requirements

- State supported runtimes, frameworks, peer dependencies, and version ranges.
- State required CSS, DOM, storage, SSR, bundler, or build-tool behavior.
- State cleanup responsibilities when the package owns resources.

Remove this section when normal installation has no additional requirements.

## Notes

- State critical limitations, non-goals, compatibility, or stability concerns.
- Keep planned features out unless they affect a current adoption or migration
  decision.

Remove this section when no critical caveat applies.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

Document bundled or derived third-party code and assets here when required, and
link to the package-level [NOTICE](NOTICE) file.
