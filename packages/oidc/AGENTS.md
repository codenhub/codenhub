# packages/oidc

## Traps

- **The build deletes a discarded call to a built-in it thinks is pure, `try` and all.** `try { decodeURIComponent(run); } catch { return true; }` built to an empty loop, so `dist/` accepted the invalid UTF-8 escapes `src/` refuses, and every Node.js test still passed because they run on `src/`. Held under tsdown 0.22.8. Prefer using the result, as `decodeRun` in `src/shared/parameters.ts` does; the `refuses invalid UTF-8 escapes` scenario in `tests/scenarios.ts` runs on the built package in workerd and catches a regression. To find another such deletion, compare the count of `catch` in `src/` with the count in `dist/`.
- **The workerd suite tests whatever `dist/` holds.** `tests/integration/workerd.test.ts` only checks that `dist/` exists, so after a source change a stale build fails scenarios that need new code, or passes ones that should fail. CI builds first; locally, run `pnpm build` before it.
