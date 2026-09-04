---
status: IMPLEMENTED
last_updated: 2026-09-04
scope: Naming and branding decisions across Coden, CodenHub, and their packages.
---

# Naming

This document explains the Coden and CodenHub brand model and how to name and title things that sit under it: packages, package titles, and the words used to describe them in READMEs, `package.json`, and the docs site. It is a guide for making and recording naming decisions, not a compliance checklist — structural README and metadata requirements stay in `docs/specs/packages-readme.md` and `docs/specs/packages-lifecycle.md`. This document only governs the words and brand attribution used within them.

## Brand model

Coden is the agency. It builds apps and websites for clients, and also builds OSS projects and internal tooling for its own workflow. Coden owns three domains, each scoped differently:

- `coden.agency`: general agency presence — what Coden does, how it can help, and the client solutions it has already built.
- `coden.dev`: Coden's software specifically. The agency also does marketing, SEO, infrastructure, and cybersecurity work; `coden.dev` is scoped to software development and OSS, separate from that broader agency work.
- `codenhub.dev`: CodenHub, this project. It centralizes the tools and packages that are the foundation of Coden's own work.

CodenHub is not a consumer-facing brand. It is the workspace: the repository, the npm scope (`@codenhub/*`), and the domain that hosts these packages' documentation. It exists so Coden's internal tools have one home, not so "CodenHub" is recognized the way "Coden" is. Titles and prose should read "Coden [X]" or a neutral name, not "CodenHub [X]" — see the branding test below.

## The branding test

Not every package should be branded as a Coden product. Apply this test before naming or titling a package:

> "Coden [X]" only when Coden originated the core content or IP. Curated, aggregated, or largely third-party-sourced content gets a neutral, descriptive name instead, regardless of how much integration or toolkit work went into packaging it.

Integration effort does not earn a brand prefix; authorship does. Two worked examples from this workspace:

- `packages/icons` combines many third-party icon families behind one registry, CSS mask generator, and scanner. Coden designed none of the icons. Even though the toolkit around them is original work, the content the package ships is not — it fails the test and stays neutral.
- `packages/skills` also draws on third-party sources, but most of them are modified by Coden to fix problems or improve on the original, with proper attribution and licensing intact. Coden's authorship over what actually ships is real — it passes the test and can be titled "Coden Skills."

When a package mixes both — some original modules, some redistributed third-party content — apply the test to what the package is _primarily_ recognized for shipping, not to every file inside it.

This test does not change attribution or licensing obligations. A package that passes the test and carries the Coden name still owes correct credit to any third-party content it includes, the same as a neutral-named package does.

## Naming the neutral cases

A package that fails the branding test still needs a title that reads as part of one coherent family, not a bare noun standing alone. Prefer a short functional descriptor over the package name itself, drawn from a shared vocabulary rather than invented fresh per package:

- **system** — a cohesive set of primitives meant to be used the same way, consistently, across projects (e.g. a design token system).
- **toolkit** / **kit** — a tool for pulling multiple existing things together and using them easily, without imposing one standard way to use them. Aggregator packages tend to land here rather than under "system."
- **registry** — a catalog or lookup structure over curated content.
- **collection** — a curated set with little added behavior beyond curation.

Pick one descriptor per package and keep it stable once chosen; the point is a recognizable, repeated vocabulary across the docs site, not a fresh word every time. Avoid descriptors that imply origination ("original," "native," "by Coden") on packages that failed the branding test — that would reintroduce the same false-authorship problem the test exists to avoid.

A neutral title still needs to read as a name, not a description, when someone says it out loud or recommends it to someone else. The test: does the title double as an ordinary English phrase, or is it clearly a name? "Styles" fails — "have you seen the update to styles?" is indistinguishable from just talking about CSS. `Kbd` passes as-is — it is not a dictionary word, so it already reads as a name the way `Redis` or `jQuery` does, with no further work needed.

The recommended way to clear this bar is to fuse the singular package name with its descriptor into one PascalCase word: `Style` + `Kit` → `StyleKit`, `Icon` + `Kit` → `IconKit`. Always singularize the base noun before fusing — this removes the grammar question entirely, there is never a `StylesKit` vs. `StyleKit` judgment call to make. This is a strongly recommended pattern, not a hard rule: skip it when the package name already clears the distinctiveness test on its own, the way `Kbd` does. Forcing a fuse onto an already-distinct name (`KbdKit`) adds length without adding distinctiveness, and a good name found later — before or after a package's stable release — is not an accidental violation of this document just because it does not follow the compounding pattern.

## Title presentation

Branded and neutral packages will use different words by design, but the resolved display name should still render consistently everywhere it appears. The shape:

```text
<Name>, <one-line functional description using the naming vocabulary>.
```

This governs the docs site: set `codenhub.docs.label` in `package.json` to `<Name>` (e.g. `IconKit`, `Coden Skills`, `Kbd`) — it drives the docs site's navigation, catalog, and page title. Pair it with `codenhub.docs.description` when the plain functional description reads better with the name folded in, e.g. "IconKit, a kit for combining icon families and dropping icons into any app."

This does not govern the README title. `docs/specs/packages-readme.md` requires the README's first heading to be the package name exactly as published (e.g. `# @codenhub/icons`), and that rule is unaffected by this document — a resolved display name and a published npm name are allowed to differ, the same way they already differ for install commands (see the note in [Existing packages](#existing-packages)). The display name MAY still appear naturally in the README's opening description sentence as ordinary prose ("IconKit combines several icon families into one registry..."), but that is a writing choice, not a requirement.

Typography and layout on the docs site should not visually distinguish branded from neutral packages beyond the words themselves — the Coden agency mark (see `docs/assets.md`) can appear on both, since CodenHub itself is a Coden project regardless of how any individual package is named.

The agency mark is a default, not a ceiling. A package may use its own dedicated logo, favicon and branding instead, when one exists, and doing so does not require reclassifying the package as branded — this document's branded vs. neutral test governs the words used to describe a package, not the artwork used to represent it. Dedicated package artwork is out of scope for `docs/assets.md`, which only covers repository-wide assets under root `assets/`; a package-specific logo lives with the package itself.

## Existing packages

Resolved display name per package, decided against the branding test and the naming vocabulary above. `packages/tools` is excluded: it is `private: true` and has no consumer-facing title to resolve.

This table resolves the _displayed_ name only. Whether the npm package name and workspace folder change to match is a separate, unresolved decision — some of these packages (`styles`, `validation`, `store`, `theme`, `error`, `skills`) are already published, and renaming a published npm package name means deprecating it and publishing fresh under the new one, which `docs/specs/packages-lifecycle.md` treats as irreversible. Until that decision is made, every package keeps its current `@codenhub/*` name and folder regardless of its resolved display name below.

| Package      | Classification  | Display name      | Notes                                                                                                                  |
| ------------ | --------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `components` | Neutral, system | `ComponentSystem` |                                                                                                                        |
| `error`      | Neutral, kit    | `ErrorKit`        |                                                                                                                        |
| `i18n`       | Neutral, plain  | `i18n`            | Already distinctive as a numeronym; industry convention keeps it lowercase.                                            |
| `icons`      | Neutral, kit    | `IconKit`         |                                                                                                                        |
| `kbd`        | Neutral, plain  | `Kbd`             | Not a dictionary word; already distinctive unfused.                                                                    |
| `router`     | Neutral, plain  | `Router`          |                                                                                                                        |
| `skills`     | Branded         | `Coden Skills`    |                                                                                                                        |
| `store`      | Neutral, system | `StoreSystem`     |                                                                                                                        |
| `styles`     | Neutral, kit    | `StyleKit`        |                                                                                                                        |
| `theme`      | Neutral, system | `ThemeSystem`     |                                                                                                                        |
| `toaster`    | Neutral, plain  | `Toaster`         | Singular concrete noun; reads as a name unfused, same reasoning as `Kbd`. Package and folder already renamed to match. |
| `ui-kit`     | Neutral, kit    | `UI Kit`          | Left unfused (`UIKit`) to avoid colliding with Apple's UIKit framework name.                                           |
| `validation` | Neutral, kit    | `ValidationKit`   |                                                                                                                        |

Plugins (`plugins/tauri/webview`, `plugins/tauri/window`, `plugins/vite/add-loader`, `plugins/vite/defer-css`, `plugins/vite/icons`) are exceptions to this table: their npm names already follow their host ecosystem's own plugin-naming convention (`tauri-plugin-*`, `vite-plugin-*`), which takes precedence over the vocabulary above. Their existing `codenhub.docs.label` values (`Tauri WebView`, `Tauri Window`, `Vite Add Loader`, `Vite Deferred CSS`, `Vite Icons`) already follow that convention and stay unchanged.

## New packages

Before naming a new package or writing its README title:

1. Apply the branding test above and decide branded or neutral.
2. If branded, use "Coden [Name]."
3. If neutral, check whether the package name already reads as a name and not a description on its own. If not, pick one descriptor from the shared vocabulary in [Naming the neutral cases](#naming-the-neutral-cases) and fuse it with the singular package name (e.g. `IconKit`). Either way, build the title as `<Name>, <descriptor-based functional description>`.
4. Record the decision in the [Existing packages](#existing-packages) table once that table is built.
