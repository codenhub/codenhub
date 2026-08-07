# @codenhub/tools

Workspace-aware repository tooling behind the root pnpm scripts. It provides the
`hub` executable, which resolves package selectors, owns build ordering, and
reports results for every root script.

This package is private and repository-local. It is not published and has no
consumer API; `src/cli.ts` is its only entrypoint.

See [`docs/tooling.md`](../../docs/tooling.md) for the command surface, selector
rules, options, and how to add a command.

## Development

```sh
pnpm test packages/tools
pnpm typecheck packages/tools
```

Sources run directly under Node's type stripping, so there is no build step. That
requires erasable-only TypeScript: no enums, no parameter properties, no
namespaces, and explicit `.ts` extensions on relative imports.
