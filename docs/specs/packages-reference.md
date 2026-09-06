---
status: IMPLEMENTED
last_updated: 2026-09-05
scope: Generated API reference documentation for public workspace packages.
---

# Package reference spec

This document defines a generated API reference for public workspace packages: a per-package, per-entrypoint set of Markdown pages compiled from the package's TypeScript declarations and source TSDoc by `pnpm generate`, published by the documentation site alongside the hand-authored public docs.

The `reference` generator (`packages/tools/src/generators/reference-generator.ts`) and the `reference` compliance check implement this document; `@codenhub/error` is the first package to opt in. "Adoption" below is the order the rollout follows. Until a package opts in per "Opting in", nothing about it changes.

## Why it is generated

`docs/specs/packages-documentation.md` makes hand-authored domain docs and source TSDoc jointly the consumer contract, and deliberately discourages mechanical files such as `methods.md` and `types.md`. A complete, accurate symbol catalogue is still something consumers reach for, and keeping one current by hand across fifteen packages is exactly the drift that spec is trying to avoid. A generated reference resolves the tension: the catalogue is derived, never hand-edited, and always regenerated in the same change as the code it describes, so it cannot drift; the hand-authored docs stay free to explain concepts, tasks, and domain rather than enumerate signatures.

This is an addition to `docs/specs/packages-documentation.md`, not a replacement for any surface it requires. See "Relationship to other documentation" below.

## Scope

This spec covers packages that ship TypeScript. The reference is compiled from emitted `.d.ts` declarations and the TSDoc attached to them. Packages that expose no API a declaration file can describe, such as the CSS-only `@codenhub/styles`, are out of scope; a CSS reference, if it is ever built, is a separate document. Plain JavaScript packages typed with JSDoc are also out of scope for now: the extractor could read JSDoc the same way it reads TSDoc, but no such package exists, and committing to that surface is a later revision of this spec rather than an implicit guarantee here.

## Opting in

A package opts in through `codenhub.docs.reference` in its `package.json`, nested inside the existing `codenhub.docs` object defined by `docs/specs/packages-documentation.md`:

```json
{
  "codenhub": {
    "docs": {
      "label": "ErrorKit",
      "status": "active",
      "reference": {
        "entrypoints": ["."],
        "prose": true
      }
    }
  }
}
```

`codenhub.docs.reference` is one of:

- An **object** — the package opts in. Every field is OPTIONAL:
  - `entrypoints`: array of `package.json` `exports` subpath keys to document, such as `"."` or `"./registries/browser"`. Defaults to every `exports` subpath that resolves to a `types` target. A key not present in `exports` is invalid. An explicitly empty array is invalid; omit the field to document every entrypoint.
  - `exclude`: RESERVED. An array of repository-relative globs is accepted and its shape validated, but the generator does not yet honour it. The intent is to omit a public symbol whose declaration originates in a matched source file — for surfaces exported for tooling reasons that are not a consumer contract; until it is implemented, prefer not exporting such symbols at all.
  - `prose`: boolean, default `true`. When `false`, pages carry the signature manifest only (see "Page content") and no prose is compiled from TSDoc. This is the low-risk subset intended to be safe to enable widely before per-package TSDoc quality is known.
- The literal **`false`** — the package explicitly opts out. Meaningful once the reference is default-on (see "Adoption"); until then, absence and `false` behave the same.
- **Absent** — the package has no generated reference.

A malformed `codenhub.docs.reference` value is invalid, the same way `docs/specs/packages-documentation.md` treats a malformed `codenhub.docs`. Only `private: false` packages, or private packages that already opt in to `docs/specs/packages-documentation.md`, may declare it.

## Structure

The reference lives under the package's public `docs/`, in its own area:

```text
docs/
  reference/
    index.md                 # the "." entrypoint, and the reference area's entry page
    registries/
      index.md               # the "./registries" entrypoint
      browser.md             # the "./registries/browser" entrypoint
      supabase.md            # the "./registries/supabase" entrypoint
```

- Each documented entrypoint maps to exactly one page. A leaf entrypoint becomes `<name>.md`; an entrypoint that also has child entrypoints becomes a folder with an `index.md`. The `.` entrypoint is always `docs/reference/index.md`.
- Page and folder names are the `exports` subpath segments verbatim. `"./registries/browser"` is `reference/registries/browser.md`. Every documented entrypoint's subpath segments MUST already be kebab-case, matching the filename rule in `docs/specs/packages-documentation.md`. The generator does not normalize a segment: rewriting `./fooBar` to `foo-bar` could silently collide with a real `./foo-bar` entrypoint. A documented entrypoint whose segment is not kebab-case, or whose page path would collide with another's, is a `reference/entrypoint` finding and stops generation for that package.
- `docs/reference/index.md` is an ordinary public document, not a `curated: true` router. It documents the `.` entrypoint and, by being the area's `index.md`, is placed first by publishing tools per `docs/specs/packages-documentation.md`. Sibling order is controlled by a generated `order` value on each page.
- The generated area is `docs/reference/` and only `docs/reference/`. A hand-authored `docs/reference.md`, or any file under `docs/reference/` the generator did not produce, is invalid; the generator owns the whole directory. Because `hub generate` writes but never deletes, a page left behind by a removed or renamed entrypoint MUST be deleted in the same change — `reference/unexpected-file` (see "Validation") fails the run until it is.

### Frontmatter

Generated pages use only the closed frontmatter schema from `docs/specs/packages-documentation.md`. No new field is introduced:

- `title`: the entrypoint's public label. For `.` it is the package's `codenhub.docs.label`. For a subpath it is the subpath without the leading `./`, such as `registries/browser`.
- `description`: OPTIONAL one-line summary of the entrypoint, when the generator has one to emit.
- `order`: generator-assigned, placing entrypoint pages in a stable order — `.` first, then remaining entrypoints by `exports` declaration order.
- `group`: set to `Reference` on `docs/reference/index.md` only, to label the sidebar section. Not set on any other page.

### Generated-file notice

Every generated page begins, immediately after its frontmatter, with a single HTML comment identifying it as generated and naming the command that rewrites it, for example:

```markdown
<!-- Generated by `pnpm generate` from packages/error/src. Do not edit. -->
```

Editing a generated page is pointless: the next `pnpm generate` overwrites it, and `hub check` reports the drift in the meantime.

## Page content

A page's H1 is its `title`. Below it, each public symbol reachable from that entrypoint is a section:

- Symbols are grouped by kind under H2 headings in this order: **Functions**, **Classes**, **Interfaces**, **Type aliases**, **Enumerations**, **Variables**, **Namespaces**. A group with no members is omitted. An export whose kind is none of these is a `reference/unsupported-export` finding, not a silent omission.
- Within a group, each symbol is an H3 named exactly as it is exported. A default export is named after its declaration; an anonymous default export is named `default`. `docs/code-guidelines.md` already steers library code to named exports, so this is expected to be rare. Members are alphabetical within their group.
- Each symbol section contains, in order:
  1. A fenced `ts` block with the symbol's declaration signature, taken from the emitted `.d.ts`. Overloads are listed as separate lines in source order. Long signatures are emitted as written; the site is responsible for horizontal scroll.
  2. When `prose` is `true`: the symbol's TSDoc summary and remarks, rendered as Markdown, followed by its `@param`, `@returns`, `@throws`, `@defaultValue`, `@example`, and `@see` content under short bold labels. `@deprecated` is surfaced first, as a blockquote, so it is impossible to miss.
  3. For a class or interface: its public members, each with its own signature block and, when `prose` is `true`, its TSDoc.
- `{@link Symbol}` references resolve to a fragment on whichever page documents the target. The fragment is the generator-owned slug of the symbol's heading. A target on the current page links as `#slug`; a target on another of this package's reference pages links as the normalized relative path from the current page to that page, plus `#slug`, computed per page pair rather than assumed. A target outside this package's documented surface is rendered as inline code, not a link. The build makes no network requests and does not resolve links into other packages' references.
- Re-exported symbols are documented on the entrypoint that exports them. A symbol exported from several entrypoints is documented on each, with the signature repeated; prose is repeated too, since these pages are read one at a time.

When `prose` is `true` and a public symbol has no TSDoc, the page still lists it with its signature. The gap is a `warning`-level finding (see "Validation"), consistent with `docs/code-guidelines.md` requiring public-API TSDoc without yet enforcing it in lint.

## Generation

The reference is produced by a generator registered in `packages/tools/src/generators/`, run by `pnpm generate` (`hub generate`) like every other derived file. It:

1. Reads each opted-in package's `exports` and `codenhub.docs.reference` to resolve the entrypoint set.
2. Runs [TypeDoc](https://typedoc.org/) against those entrypoints in JSON-emit mode, using the package's own `tsconfig.json`.
3. Transforms the TypeDoc JSON into a repository-owned, presentation-neutral model in `packages/tools/src/documentation/`, published as part of `@codenhub/tools/documentation`.
4. Renders that model to the Markdown pages defined above and returns their contents; `hub generate` diffs and writes, so `--dry-run` and change detection are not reimplemented.

The documentation site consumes the same `@codenhub/tools/documentation` model — either the rendered Markdown through its existing Markdown pipeline, or the neutral model directly — so there is one implementation of the reference contract, matching how `docs/tooling.md` already shares that module between the tooling and `apps/docs`.

TypeDoc is a dependency rather than an in-house extractor because faithfully modelling generics, overload sets, inherited and merged members, and `{@link}` resolution from the TypeScript AST is a large surface to reproduce and keep correct as TypeScript evolves. It is added to `@codenhub/tools` `devDependencies` under `catalog:`; the reference model is what the rest of the repository imports, not TypeDoc's own types.

`pnpm generate` MUST be run in the same change as any edit to an opted-in package's public API or its TSDoc. The `hub generate --dry-run` drift gate in `docs/ci.md` covers the reference the same as `llms-full.txt`.

## Relationship to other documentation

- **`README.md` / `docs/index.md`**: unchanged in purpose. When a package opts in, its README Documentation section and its `docs/index.md` MUST link to `docs/reference/index.md`, satisfying the "make complete API reference easy to find" requirement in `docs/specs/packages-readme.md`. The hand-authored docs MUST NOT be reduced to a stub that only points at the reference; `docs/specs/packages-documentation.md`'s completeness rules still apply to them.
- **Source TSDoc**: remains the single source of per-symbol truth. The reference is a rendering of it, not a second contract.
- **`llms.txt`**: stays hand-authored; it MAY link to the reference area.
- **`llms-full.txt`**: does NOT include the generated reference. `docs/specs/packages-documentation.md` is revised in the same change to exclude `docs/reference/` from the `llms-full.txt` compilation. The reference is regenerable from declarations and adds no hand-authored content an LLM cannot reconstruct from the `.d.ts` it already has; including it would multiply the file's size for little gain.
- **Publishing**: `docs/reference/` is public `docs/` and ships in the package tarball like any other public documentation. `docs/internal/` exclusion is unaffected.

## Validation

`pnpm check` (`hub check`) gains a `reference` rule, implementing `CheckRule` and registered in `packages/tools/src/checks/registry.ts`. It `appliesTo` a package whose `codenhub.docs.reference` is an object — one that has opted in. An absent value and the literal `false` are both outside the rule. When the reference flips to default-on (see "Adoption"), that predicate widens to "not `false`" in the same change. The rule reports:

- `reference/missing` — `error` — opted in, but `docs/reference/` is absent.
- `reference/drift` — `error` — a generated page differs from what the generator produces now. This is the compliance-report view of the `hub generate --dry-run` gate.
- `reference/unexpected-file` — `error` — a file exists under `docs/reference/` that the generator did not produce. `hub generate` only writes, so a page orphaned by a removed or renamed entrypoint must be deleted by hand in the same change; this finding fails the run until it is.
- `reference/entrypoint` — `error` — a documented entrypoint's subpath is not kebab-case, its page path collides with another's, or a configured `entrypoints` key does not resolve.
- `reference/unsupported-export` — `error` — a documented entrypoint exposes an export whose declaration kind the page model does not cover.
- `reference/undocumented-symbol` — `warning` — `prose` is `true` and a public symbol reachable from a documented entrypoint has no TSDoc.

`error` findings fail the run; `warning` findings do not, per `docs/tooling.md`. Link, frontmatter, single-H1, and tarball-inclusion validation for the generated pages is the existing `documentation` rule's job; the generator MUST emit pages that pass it.

## Adoption

1. **Opt-in, one package.** Approve this spec, build the generator and the `reference` check, and opt `@codenhub/error` in with `prose: true`. `@codenhub/error` has four entrypoints, mixes functions, types, and classes, and is already required to carry rich TSDoc, so it exercises the generator without a migration.
2. **Opt-in, by choice.** Other packages opt in as their TSDoc is brought to standard. No package is required to.
3. **Signature manifest, wider.** Once the generator is proven, `prose: false` output MAY be enabled for packages that have not opted in, giving every public package a signature catalogue while prose stays opt-in. This step is a separate decision and a separate change; this spec only reserves the shape for it.
4. **Default-on.** When the generator and the repo-wide TSDoc baseline hold up, the full reference flips to default-on for `private: false` packages, with `codenhub.docs.reference: false` as the opt-out. Flipping the default is a `docs/specs/packages-documentation.md` change and its own review.

## Exceptions

Exceptions to this spec MUST follow `docs/docs-guidelines.md` and be recorded in `docs/specs/packages-exceptions.md`. An exception to the `reference` check MUST declare a `Checks bypassed` bullet with the affected codes, per that register.
