# packages

## Traps

- **`localStorage` is `undefined` in a jsdom test on Node.js 25 and later.** Node.js defines a global `localStorage` of its own, which reads as `undefined` unless `--localstorage-file` is given, and Vitest's jsdom environment keeps a global that already exists instead of installing jsdom's, so a test that calls `localStorage.clear()` throws "Cannot read properties of undefined". Held with Node.js 26.13.1, Vitest 4.1.12 and jsdom 30.1.3 on 2026-11-14, when the move to Node.js 26 failed the suites of `@codenhub/i18n`, `store`, `theme` and `ui-kit`. Prefer `execArgv: ["--no-experimental-webstorage"]` in the package's `vitest.config.ts`, which removes Node's global so jsdom's takes its place; Node.js 24 accepts the flag too, so the `floor` job runs the same config.
