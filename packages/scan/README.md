# @codenhub/scan

Finds and reads the content files the build commands of `@codenhub/styles` and `@codenhub/icons` scan for class names.

This package is private and repository-local. It is not published: each package that uses it declares it as a `workspace:*` devDependency, lists it in `codenhub.bundled`, and inlines it into its own build, as [A private workspace package](../../docs/specs/packages-lifecycle.md#a-private-workspace-package) describes. A change here reaches consumers only through those packages' releases, so it passes the gate for each of them, `pnpm verify scan icons styles`, and is named in their changelogs.

It resolves content entries, a literal path first and a glob second, reads each file one at a time, as UTF-16 after a UTF-16 byte order mark and as UTF-8 otherwise, and splits text into words by a character set the caller gives. Two strict modes, `failOnUnmatched` and `failOnUnreadable`, are off unless the caller turns them on. Which words count as classes stays in each package. [Build command](../icons/docs/internal/cli.md#the-shared-scanner) in `@codenhub/icons` records the split.

## Development

```sh
pnpm test scan
pnpm typecheck scan
```

The source runs as it is: `exports` names `src/index.ts`, and each package's bundler compiles it into that package's output.
