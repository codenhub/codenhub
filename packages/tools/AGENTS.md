# packages/tools

## Traps

- **TypeScript that only compiles crashes `hub`.** `hub` runs `src/cli.ts` with Node.js type stripping, not a build, so syntax that is not erasable, such as a constructor parameter property (`constructor(private readonly x: T)`) or an `enum`, fails at load with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. `tsc -b` and Vitest both accept it, because `erasableSyntaxOnly` is off. Held on Node.js 24.22.1 on 2026-11-01. Prefer plain fields assigned in the constructor and `as const` objects; check a change by running a `hub` command that loads it.

- **Dropping the pre-migration metadata shape breaks the site builds.** `parsePackageMetadata` reads identity from `codenhub.docs` when a manifest still declares it there, and removing that branch looks safe because `hub check` already rejects the shape in the working tree. Production builds of `apps/docs` and `apps/www` parse each package's manifest **at its newest release tag**, so they fail while any such tag predates the move. Held as of 2026-10-17, when every release tag carried the old shape. Check before removing: for each package declaring `codenhub.docs`, `git show "<newest stable tag>:<package path>/package.json"` has no `label` or `status` inside `codenhub.docs`. Remove the branch, as `docs/specs/packages-metadata.md` lists, as soon as that holds, and this trap with it.
