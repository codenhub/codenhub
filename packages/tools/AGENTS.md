# packages/tools

## Traps

- **Dropping the pre-migration metadata shape breaks the site builds.** `parsePackageMetadata` reads identity from `codenhub.docs` when a manifest still declares it there, and removing that branch looks safe because `hub check` already rejects the shape in the working tree. Production builds of `apps/docs` (and, once it reads release tags, `apps/www`) parse each package's manifest **at its newest release tag**, so they fail while any such tag predates the move. Held as of 2026-10-17, when every release tag carried the old shape. Check before removing: for each package declaring `codenhub.docs`, `git show "<newest stable tag>:<package path>/package.json"` has no `label` or `status` inside `codenhub.docs`. Remove the branch, as `docs/specs/packages-metadata.md` lists, as soon as that holds, and this trap with it.
