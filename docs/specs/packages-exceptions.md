---
status: IMPLEMENTED
last_updated: 2026-11-22
scope: Approved exceptions for workspace packages.
---

# Package exceptions

This document is the central register for package-specific exceptions to repository guidelines and package specs. `docs/guidelines/documentation.md` defines the exception requirements.

An exception to a rule that `hub check` enforces MUST also declare a `Checks bypassed` bullet listing the affected check codes in backticks, as shown below. `hub check` reads that bullet, so a waiver cannot exist without being recorded here. Run `pnpm check --json` to see the code behind any finding.

`hub check` reports a waiver that suppresses nothing, so a stale entry or a mistyped code or package name surfaces instead of looking effective. Remove an entry once the package no longer needs it.

## `@codenhub/styles`: the root entry is a stylesheet

- **Rules bypassed:** `docs/specs/packages-lifecycle.md` (metadata fields `main` and `module` required in `package.json`).
- **Checks bypassed:** `metadata/main`, `metadata/module`.
- **Where it applies:** `packages/styles/`.
- **Why acceptable:** The package ships stylesheets and one build command, `chs`, declared as its `bin`; its root entry is a stylesheet, and its one JavaScript entry, the Vite plugin, is the `./vite` export a configuration imports by that name, so `main` and `module` would point at no usable runtime entrypoint. It does declare `types`: an empty `dist/index.d.cts`, CommonJS so that a CommonJS file under `module: node16` may import it as an ES file does, the file the `dist/` exports' `types` conditions name (the `/tw` exports name the same empty `tw/index.d.cts`), so a TypeScript project that checks side-effect imports resolves them; `tests/integration/exports.test.ts` compiles such imports.
- **Temporary or permanent:** Permanent while the package's root entry is a stylesheet.

## `@codenhub/styles`: Tailwind is not a peer

- **Rules bypassed:** `docs/specs/packages-lifecycle.md`, "Choosing the field" (published code imports only `dependencies` and `peerDependencies`, and a host integration the consumer supplies is a `peerDependency`).
- **Checks bypassed:** `dependencies/runtime-declaration`.
- **Where it applies:** `packages/styles/tw/`, which the `/tw` exports name and which imports `tailwindcss`; nothing in `dist/` or the `chs` command imports it.
- **Why acceptable:** The `/tw` files are source the consumer's own Tailwind compiles, so the consumer supplies Tailwind by running it, and the package never resolves it. Declared as an optional peer until 0.11.0, it still took part in npm's resolution: a project on Tailwind 3, or on 4.x below the floor, failed `npm install` with `ERESOLVE`, even one that only linked the compiled CSS, which needs no Tailwind. The supported range is stated in `packages/styles/docs/integrating/tailwind.md` instead, where `.github/workflows/tailwind.yml` reads the floor it tests, and `packages/styles/docs/internal/model.md`, "No Tailwind peer", records the decision. The cost is that no package manager checks a `/tw` consumer's Tailwind version.
- **Temporary or permanent:** Permanent while npm fails an install on an out-of-range optional peer.
- **Reevaluate when:** npm treats an optional peer's range as a warning, as pnpm does; or `/tw` moves to a package of its own, whose every consumer runs Tailwind and could take a required peer.

## `@codenhub/styles`: no visual regression baselines

- **Rules bypassed:** `docs/specs/tests.md` (use visual regression testing for style sheets and components to capture visual changes before merge).
- **Where it applies:** `packages/styles/tests/browser/`.
- **Why acceptable:** What the package renders is CSS alone, and the asserted contract is limited to token resolution, computed composition, state and accessibility behavior, material geometry, and related DOM behavior. The browser suite asserts those contracts directly in Chromium, Firefox, and WebKit, including glass and reduced-transparency behavior. These assertions do not detect every final-paint defect: clipping or compositing integration, font rendering, antialiasing, and interactions among properties that each compute correctly can still be wrong on screen. Screenshot baselines would add substantial platform variance without making those failures reliably diagnostic, so the current targeted assertions are the more effective gate for this package.
- **Temporary or permanent:** Permanent while the package ships no JavaScript that runs in the browser and this computed-style, cross-browser strategy remains effective.
- **Reevaluate when:** The package ships JavaScript that runs in the browser; the browser suite stops covering Chromium, Firefox, and WebKit or its glass and reduced-transparency branches; the public contract adds a visual outcome that computed styles and DOM behavior cannot assert; or a confirmed final-paint, clipping, compositing, font-rendering, antialiasing, or correct-property-interaction regression passes the suite. Reevaluation means choosing an effective test for the demonstrated gap and updating this exception; it does not presume screenshot baselines.

## `@codenhub/skills`: CLI-only package

- **Rules bypassed:** `docs/specs/packages-lifecycle.md` (metadata fields `main`, `module`, and `types` required in `package.json`).
- **Checks bypassed:** `metadata/main`, `metadata/module`, `metadata/types`.
- **Where it applies:** `packages/skills/`.
- **Why acceptable:** The package ships skill assets and the `codenhub-skills` installer only, and exports no JavaScript or TypeScript API; `exports` declares only `./package.json`. Adding `main`, `module`, and `types` would point at no usable entrypoint.
- **Temporary or permanent:** Permanent while the package exposes no library API.

## `@codenhub/error`: built-in opt-in registry presets

- **Rules bypassed:** `docs/specs/errors.md` (general library packages must not instantiate or export preset registries when publishing error definitions).
- **Where it applies:** `packages/error/src/registries/` and the public registry preset exports from `@codenhub/error/registries` and its browser, Node.js, and Supabase subpaths.
- **Why acceptable:** `@codenhub/error` owns the shared registry implementation and built-in integrations. Its presets are frozen, opt-in snapshots; importing them does not mutate the global registry, establish external connections, or add runtime dependencies. Raw mapping exports remain available for consumers that need definitions without preset registries.
- **Temporary or permanent:** Permanent while `@codenhub/error` remains the designated owner of built-in error integrations.
