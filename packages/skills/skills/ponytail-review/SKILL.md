---
name: ponytail-review
description: Reviews code for over-engineering, finding what to delete, inline, or replace with the standard library or platform, and ledgers deferred work and shortcuts. Use when the user asks to review a diff or pull request for over-engineering or complexity, audit a codebase for bloat, asks what can be deleted or simplified, or wants the list of TODOs, shortcuts, skipped features, or technical debt. Not for correctness, security, or performance review.
---

# Ponytail Review

Hunt unnecessary complexity and list it. The best outcome of a review is a shorter codebase. Lists findings and applies nothing.

Pick the scope from the request, taking the first that matches:

1. **Ledger:** the user asks about deferred work, shortcuts, skipped features, TODOs, or debt, with or without a diff.
2. **Diff:** a diff, branch, or pull request is in play.
3. **Audit:** the whole codebase or a directory, when the user asks for an audit or no diff is in play.

## Tags

- `delete:` dead code, unused flexibility, a speculative feature. Replacement: nothing.
- `stdlib:` a hand-rolled version of something the standard library ships. Name the function.
- `native:` a dependency or code doing what the platform already does. Name the feature.
- `yagni:` an abstraction with one implementation, configuration nobody sets, a layer with one caller.
- `shrink:` the same logic in fewer lines. Show the shorter form.

## Diff

One line per finding: `L<line>: <tag> <what>. <replacement>.`, or `<file>:L<line>: ...` across files.

- Bad: "This EmailValidator class might be more complex than necessary; have you considered whether all these rules are needed?"
- Good: `L12-38: stdlib: 27-line validator class. A "@" check is enough; the confirmation email is the real validation.`
- Good: `L4: native: moment imported for one format call. Intl.DateTimeFormat, 0 deps.`
- Good: `repo.ts:L88: yagni: AbstractRepository with one implementation. Inline it until a second exists.`
- Good: `L30-44: shrink: manual loop builds an object. Object.fromEntries(pairs), 1 line.`

End with `net: -<N> lines possible.` Nothing to cut: `Lean already. Ship.`

## Audit

Scan the tree instead of a diff. Hunt dependencies the standard library or platform already ships, single-implementation interfaces, factories with one product, wrappers that only delegate, dead flags and configuration, and hand-rolled standard library.

One line per finding, biggest cut first: `<tag> <what to cut>. <replacement>. [path]`. End with `net: -<N> lines, -<M> deps possible.` Nothing to cut: `Lean already. Ship.`

## Ledger

Collect deferred work from the two places it is recorded, skipping dependency, VCS, and build directories:

```sh
grep -rnE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build '(#|//|/\*|\*|<!--|--) ?(TODO|FIXME|HACK|XXX)(\([^)]*\))?:' .
git log --grep='^Skipped:' --format='%h %s%n%(trailers:key=Skipped,valueonly)'
```

Add the project's other build directories and comment prefixes as needed. One row per marker or trailer, grouped by file, then by commit:

- `<file>:<line>: <what was simplified>. ceiling: <the limit>. revisit: <the trigger>.`
- `<commit>: skipped <feature>. revisit: <the trigger>.`

Tag any row that names no trigger for revisiting with `no-trigger`; those are the ones that quietly become permanent. End with `<N> items, <M> with no trigger.` Nothing found: `No deferred work recorded.` Write the ledger to a file only when asked.

## Boundaries

Over-engineering and complexity only. Route correctness bugs, security holes, and performance to a normal review. One small smoke test or assertion-based self-check is the minimum, not bloat; never flag it for deletion. For building new code minimally, use the `ponytail` skill.
