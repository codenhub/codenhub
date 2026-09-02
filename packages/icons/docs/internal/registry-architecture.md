---
status: APPROVED
last_updated: 2026-08-24
scope: Icon data model, family catalog, generation pipeline, and resolution core of `@codenhub/icons`.
---

# Icon registry architecture

This document defines how `@codenhub/icons` stores, generates, licenses, and resolves icon families. It is the source of truth for the registry rewrite; the implementation that predates it is legacy.

## Purpose

The package exists to make icons **easy, fast, and free of licensing worry**. Everything below serves that sentence:

- **Easy**: write `ic-heart` in markup, get an icon. No imports, no components, no runtime.
- **Fast**: zero runtime by default. Only the icons a project actually uses reach the bundle, whatever the family size.
- **Free of worry**: a consumer using the core catalog has every license obligation satisfied by the default build, and a consumer opting into a credit-required family gets that credit produced for them too.

Non-goals: being an Iconify wrapper, shipping a component library, hosting an icon API, or bundling brand and logo sets.

## Why the previous design could not scale

Recorded so the constraints are not rediscovered:

- `src/registry/providers/lucide/icons.ts` held ~1600 icons as a 644 KB TypeScript object literal committed inside the library source. Icon content and library code shared a build unit.
- No generator existed. The dataset was produced once, by hand. There was no upstream version, no checksum, no way to re-sync Lucide, and no provenance for the four hand-written entries (`edit`, `filter`, `home`, `refresh`) appended to the end of the file, which duplicated Lucide names that already existed (`pencil`, `house`).
- The package entrypoint and both bundler plugins imported that literal statically, so every consumer paid 680 KB whether or not they used one icon. Object literals do not tree-shake.
- `IconProvider.getIcon()` was synchronous, which forbids lazy family chunks and any on-demand loading.
- Icons stored complete `<svg>` strings, repeating ~200 bytes of identical attributes per icon and leaving no clean way to re-wrap an icon at a different size.
- Alias resolution existed in three places: `IconDefinition.alt`, `IconSet.aliases`, and a map the Lucide provider built for itself.
- No family metadata: no license, no upstream version, no tags, no variant model, so neither legal attribution nor catalog search could be built on it.

## Layers

```text
data/<prefix>/icons.json      generated family data, committed, reviewable
        |
        v
src/core/                     schema, registry, resolution, aliases, loaders
        |
        +-- src/catalog/      family metadata, tiers, attribution notices
        +-- src/adapters/     third-party set adapters (Iconify-shaped JSON)
        |
        v
src/generator/ src/scanner/   CSS mask output, class extraction
        |
        v
src/vite/ src/postcss/        build integrations, attribution emission
src/tailwind/                 Tailwind v4 plugin, icons generated on demand
```

Direction is one-way. The core never imports a family, an integration, or the catalog. Family data never imports code.

## Data model

The on-disk schema is **structurally compatible with IconifyJSON** and the package takes **no dependency on Iconify**. Compatibility is a feature for consumers who already have icon data in that shape; it is not a foundation.

```ts
interface IconFamilyData {
  prefix: string;
  info: IconFamilyInfo;
  width?: number; // family-wide viewBox width
  height?: number; // family-wide viewBox height
  icons: Record<string, IconData>;
  aliases?: Record<string, IconAlias>;
}

interface IconData {
  body: string; // inner SVG markup only
  width?: number; // per-icon override
  height?: number;
  tags?: string[];
}

interface IconAlias {
  parent: string;
}
```

Rules:

- `body` holds inner markup only. The `<svg>` wrapper is reconstructed at render time from `width`/`height`, so size, color, and stroke stay controllable.
- Every field Iconify defines and we do not use is simply absent; every field we add lives under `info`, which Iconify treats as opaque. A third-party IconifyJSON set therefore loads through `adapters/iconify` with no transformation of icon bodies.
- Icon names are kebab-case and unique within a prefix. An alias never points at another alias.

### Family info

```ts
interface IconFamilyInfo {
  name: string; // display name
  total: number;
  author: { name: string; url: string };
  license: { title: string; spdx: string; url: string };
  attribution: "none" | "notice" | "credit"; // consumer-facing obligation
  tier: "core" | "extended";
  upstream: { package: string; version: string };
  strokeWidth?: number; // present only for stroke-based families
  style?: string; // descriptive: "outlined", "filled", "duotone"
  weight?: string; // descriptive: "300", "regular", "bold"
}
```

`strokeWidth` replaces the old per-icon `strokeConfigurable` boolean. A family whose art is stroke-based declares its authored width; its icons are stroke-configurable. A family of filled paths omits it and stroke classes are ignored for its icons. This is a family-level property because it is a property of how the family was drawn, not of an individual icon.

`style` and `weight` are **descriptive metadata for catalog and docs only**. They are not a resolution axis — see below.

### Variants are prefixes

`phosphor`, `phosphor-fill`, `phosphor-duotone`, `material-symbols-outlined`, `material-symbols-outlined-fill` are separate families with separate prefixes and flat icon maps. Resolution stays one-dimensional: a prefix and a name.

The alternative — a variant axis inside a family — would add a dimension to the resolver, the scanner, the CSS generator, and every cache key, to express something a distinct prefix already expresses. `info.style` and `info.weight` let the catalog group siblings for humans without the core knowing they are related.

### Reserved prefixes

`after` and `bg` are words the utility classes own: `ic-after` and `ic-bg` are modifiers, so a family named after one would produce classes the scanner reads as a modifier rather than an icon. Generation refuses such a family rather than leaving the collision to be discovered as an icon that silently fails to render.

`stroke` was reserved for the same reason until 0.2.0, when `ic-heart ic-stroke-1.5` became `ic-heart/1.5`. Writing the width as a modifier on the icon class rather than as a class beside it freed the word, and removed the cross-product the old form forced: the generator had to emit a rule for every scanned icon paired with every scanned width, because the two classes were independent. One token addressing one icon at one width is one rule.

## Family data layout

```text
packages/icons/data/<prefix>/
  icons.json         generated family data
  LICENSE            upstream license text, copied verbatim
  ATTRIBUTION.md     generated notice naming author, license, upstream version
```

All three are committed and generated. `icons.json` is the reviewable unit: one file per family, so an upstream bump is one diff, not thousands. Thirteen families currently occupy about 17 MB, which git stores compressed and which churns only when an upstream version moves.

The build compiles each family into `dist/data/<prefix>.js` plus declarations, exposed as:

```json
"./data/*": { "types": "./dist/data/*.d.ts", "import": "./dist/data/*.js" }
```

so `import lucide from "@codenhub/icons/data/lucide"` is the supported path. Family JSON is not published raw; `dist` is the published surface.

### Why not per-icon modules on disk

Per-icon ESM modules give perfect tree-shaking, and generating them for every family would put roughly 34,000 files in the tarball at launch scope alone, growing with each family. Instead the Vite plugin resolves `virtual:@codenhub/icons/<prefix>/<name>` to a generated module read from family data at build time. Same tree-shaking and code-splitting, no files shipped.

Each module exports the rendered markup as `svg` and as its default export, and the resolved icon as `icon`. An unresolvable name throws during the build rather than producing an empty module, because a typo in a dynamic icon name is otherwise invisible until someone looks at the page. A family reached only through such a module still counts toward the attribution notice.

Consumers on other bundlers import the family module and rely on the build-time CSS path, which is the primary path anyway.

## Generation pipeline

Family data is produced by a generator registered in `packages/tools/src/generators/`, so `pnpm generate icons` rewrites it and `hub generate --dry-run` proves in CI that committed data matches the pinned upstream. This is the same contract `llms-full.txt` already uses: generators return contents, the command diffs and writes.

Sources are the families' own official npm packages, added to `packages/icons` as devDependencies and read from `node_modules` at generation time. Versions are pinned by the lockfile; generation is offline, reproducible, and adds nothing to what a consumer installs. No Iconify package participates.

Per family the generator:

1. Resolves the upstream package directory from the icons package.
2. Reads its SVG files through a small source adapter that knows that family's file layout and naming.
3. Normalizes each icon: strip the `<svg>` wrapper, keep inner markup, collapse whitespace, drop `xmlns`, `class`, `id`, and fixed `width`/`height`, keep `currentColor`, record the viewBox at family level when uniform.
4. Emits `icons.json` with keys sorted, so a diff shows content changes only.
5. Copies the upstream `LICENSE` verbatim and writes `ATTRIBUTION.md`.
6. Fails the run when the family license is not on the allowed list, when an icon body is empty, or when a viewBox is missing and cannot be defaulted.

Output must be deterministic: no timestamps, no generation dates, stable key order. A generator whose output changes without an input change breaks the CI drift gate.

## License and attribution

Two obligations, deliberately separated.

**What we redistribute** is not optional. Every family directory carries its `LICENSE` and `ATTRIBUTION.md`, generated from family metadata, present in the repository and in the tarball, regardless of consumer configuration.

**What lands in a consumer's build output** is configurable, because that is the consumer's own distribution:

| `attribution`      | Behavior                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"auto"` (default) | Prepend a `/*! ... */` banner to generated CSS naming only the families the build actually used. `/*!` survives default esbuild and terser `legalComments`. |
| `"file"`           | Emit `icons-attribution.txt` as a build asset instead of inlining.                                                                                          |
| `"off"`            | Emit nothing. Warn once at build time, naming the families that need a notice and where the package's own notices live.                                     |

Obligations come in three levels, because permissive is not the same as free of obligation. MIT, ISC, and Apache-2.0 all require the copyright and license notice to be preserved in redistributions; only CC0 and the Unlicense require nothing:

- `"none"`: CC0-1.0, Unlicense. Nothing is owed.
- `"notice"`: MIT, ISC, Apache-2.0. The notice must travel with the output, and the default banner satisfies it.
- `"credit"`: CC-BY and similar. The author must be credited visibly.

Tiers make the promise machine-checkable:

- **core**: `attribution` of `"none"` or `"notice"`. A default build satisfies every obligation automatically, so a consumer never has to think about it.
- **extended**: `attribution: "credit"`. Opt-in per family, marked in the catalog and in docs, because a credit obligation is a design decision, not a build setting.

The generator refuses to write a family whose license is not on the allowed list for its declared tier. `attribution: "off"` is only legally free for a build using `"none"` families exclusively; the build warning says which families made it non-free. Brand and logo families are out of scope entirely: trademark obligations are independent of the icon license and the package cannot make its promise about them.

A CSS comment is a defensible notice medium but a consumer minifying with `legalComments: "none"` strips it. That is why `"file"` exists, and the docs say so.

## Resolution

The core has **no default prefix**. A name without a prefix resolves against the default the consumer configured; with none configured, an unprefixed name that is not a semantic alias does not resolve. Dropping the hardcoded `"lucide"` default is itself a breaking change for consumers who relied on unprefixed names resolving to Lucide: they must now configure `defaultPrefix: "lucide"` explicitly to keep that behavior. Making the default configurable is what lets a future replacement of Lucide happen without another breaking change.

Lookup order for `resolve(name)`, limited to families already loaded:

1. Configured default prefix, when the name has no prefix.
2. Family aliases within the prefix.
3. Family icons within the prefix.

`resolveAsync(name)` follows the same order, but for each candidate prefix that is not yet loaded, it loads the family first — from a registered loader, or the already-registered data — before trying to resolve against it.

### No default family

The registry names no default family and carries no curated map of semantic names. An unqualified name resolves against `defaultPrefix` or against nothing.

Version 0.2.0 removed a 35-entry semantic map — `close` to `lucide:x`, and so on. It read as a package-wide feature but every entry pointed at Lucide, so for the other twelve families it silently fell through to the default prefix: the package advertised semantic resolution and honoured it for one family in thirteen. Curating it for every family is thirteen times the editorial work and a standing obligation on every upstream bump; leaving it in place meant one family's vocabulary was quietly the package's.

It also could not survive the plugin-free path. A static family stylesheet has no alias layer, so a semantic name would have resolved under the plugins and silently failed without them — the inconsistency the entry-point work exists to remove.

A curated `core` family, with its own prefix and its own artwork, is the honest shape for this if it comes back. That is a family a project opts into, not a default it cannot see.

### Loaders

`IconProvider`'s synchronous `getIcon` is replaced by a loader contract:

```ts
registry.registerFamily(family); // sync, already-loaded data
registry.registerLoader(prefix, () => import("...")); // async, loaded on demand
await registry.load(prefix);
registry.resolve(name); // sync, loaded families only
await registry.resolveAsync(name); // loads the family if needed
```

Build-time consumers — the scanner, the CSS generator, both plugins — stay on the synchronous path, because a build knows every family it needs before it starts. Runtime consumers get the async path and pay for one family chunk when they first touch it.

## Breaking changes

The package is pre-1.0 and documents itself as experimental. The rewrite breaks freely and documents what breaks; no compatibility shims are kept, per `docs/code-guidelines.md`.

- `lucideIconSet` and `lucideProvider` are removed. Family data moves to `@codenhub/icons/data/lucide`.
- `IconProvider` and `registerProvider` are removed in favor of `registerFamily`/`registerLoader`.
- `IconSet`/`IconDefinition` are replaced by `IconFamilyData`/`IconData`; icons hold `body`, not a full `<svg>` string.
- `IconDefinition.alt` is removed; aliases live in `aliases`.
- `strokeConfigurable` per icon is replaced by `info.strokeWidth` per family.
- The default prefix `"lucide"` is removed; consumers configure their own.

## Testing

- Core resolution, aliasing, tiering, and loader behavior are unit tested with small hand-written fixtures, never against a real family.
- Source adapters are unit tested against a few checked-in SVG fixtures per family so a layout change upstream fails loudly.
- Generated data is validated by the generator itself, not by tests asserting the presence of individual icons; a test naming `lucide:heart` fails on an upstream rename that is not our bug.
- The CI drift gate (`hub generate --dry-run`) is what proves committed data matches the pinned upstream.

## Open direction

Not scheduled, recorded so the design leaves room:

- A first-party Codenhub family owning the semantic names.
- Per-icon virtual modules for bundlers other than Vite; only the Vite plugin serves them today.
- A searchable catalog surface in `apps/docs` built from `info` and `tags`.
- Per-family Tailwind plugin entry points, e.g. `@plugin "@codenhub/icons/tailwind/lucide"`. A Tailwind plugin handler must be synchronous — utilities registered after an `await` are dropped — so the generated `dist/tw/plugin.js` imports all thirteen families statically and every build pays to load them: measured at ~130 ms and ~101 MB RSS, against ~11 ms and ~62 MB for one family. A per-family entry would load only what a project names, at the cost of thirteen generated modules, a `./tailwind/*` export, and a rule for how `default:` resolves across several `@plugin` imports (`default: true` per plugin, last import wins bare names by cascade). `/tw` stays all-families: that is the price of its zero configuration. The cost is per build and does not grow with project size, so this is optimisation, not correctness.
