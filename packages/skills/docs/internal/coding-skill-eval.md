---
status: DRAFT
last_updated: 2026-11-06
scope: Evaluation scenarios and rubric for the coding skill.
---

# Coding skill evaluation

Scenarios and pass criteria, written before the baseline runs. Evidence and results: [coding-skill-research.md](coding-skill-research.md).

## Prompts

Each run gets its own copy of the fixture project and only the prompt below, with no mention of an evaluation. The baseline and rounds 1 to 3 ran on haiku, sonnet, and opus; rounds 4 to 6 ran on gpt-6.1-sol, a second strong model, and gemini-3.8-flash (see the results in the research notes).

- **S1 runner** (Node 24 TypeScript CLI with `--bail`/`--config`, setup commands via `spawnSync`, targets via `spawn`, both with `shell: true`): "Add a `--timeout <seconds>` option. Any command that runs longer than that is stopped and counts as failed. Keep the existing tests passing and add tests for the new behavior."
- **S2 prefs** (Node 24 TypeScript, only a `KeyValueStorage` interface): "Write `src/preferences.ts` for our reader app. `createPreferences({ defaults, storage })` returns `get()`, `set(partial)`, `reset()`, and `setFromQuery(search)`, which applies URL params like `?theme=dark&fontSize=18&language=pt-BR` (people share links with their preferences in them). Preferences: `theme` (light, dark, system), `fontSize` (10–32), `language` (a BCP 47 tag). Persist to the injected storage and restore from it on create. Add tests."
- **S3 sitemap** (Python standard library; four Markdown pages with frontmatter): "Write `build_sitemap.py`. Usage: `python build_sitemap.py https://docs.example.com` writes `dist/sitemap.xml` from `content/*.md`. Skip drafts, newest `updated` first, `<lastmod>` from `updated`. It runs in CI right before deploy. Add tests (unittest)."
- **S4 todos** (small monorepo, edge of scope): "Quick one: write `scripts/count-todos.mjs` that prints how many TODO comments each package under `packages/` has. It's just for me to run locally once."
- **S5 orders** (Node 24 TypeScript; pricing duplicated in `quote()` and `checkout()`; added before round 3): "Nobody can answer questions during this session. If you need a decision from me, stop and put the question in your final reply, with the options and your recommendation, instead of guessing. Task: Add a loyalty discount: customers with 5 or more previous orders get 10% off the subtotal, applied before coupons. Add tests."

The fixture projects are in [`evals/coding/fixtures/`](../../evals/coding/fixtures/). Formatters and the linter skip them, because their flaws are what the scenarios test. Each run copies one into a new directory outside the repository and runs `git init` there, so the agent sees only that project. Later rounds' prompts also tell the agent to work only inside that directory and the system temporary directory, to use Bash, and where the skill's `SKILL.md` is.

## Rubric: S1 runner: add `--timeout <seconds>` (TS, Node CLI)

Prompt: add a `--timeout <seconds>` option; any command running longer is stopped and counts as failed; add tests.

- S1.1 Validation of the final value: rejects missing value, empty, non-numeric ("abc", "10s"), 0 or negative, NaN, Infinity; and checks the value AFTER conversion to ms (e.g. 1e308 → Infinity ms, or > setTimeout max 2147483647 ms which Node clamps to 1ms). [pattern 2]
- S1.2 Applies to BOTH code paths: setup commands (spawnSync) and target commands (spawn). [pattern 5]
- S1.3 Stops the process tree, not just the shell (`shell: true` + `child.kill()` leaves the grandchild running; needs `detached` + process-group kill on POSIX and `taskkill /T` on Windows, or avoiding the shell). [pattern 8]
- S1.4 A timed-out command counts as failed (exit code 1), timer cleared on normal exit, no double resolve. Setup timeout fails the run.
- S1.5 Tests exercise real behavior: a test actually runs a slow command and asserts it is stopped/failed; validation tests cover the degenerate values; tests would fail if the feature were removed. [pattern 1]
- S1.6 README Options section updated (and any usage/help text). [pattern 10]
- S1.7 Verified: ran the test suite and reports the result truthfully.
- Over1 Adds no dependency, no config-file timeout, no per-command timeouts, no retry.

## Rubric: S2 prefs: `createPreferences` store (TS library)

Prompt: createPreferences({ defaults, storage }) with get/set/reset/setFromQuery; theme enum, fontSize 10–32, language BCP 47; persist to injected storage, restore on create; URL params come from shared links.

- S2.1 `set({ theme: undefined })` (explicit undefined) does not wipe the value or store `undefined`/null; behavior is deliberate and tested or documented. [pattern 7]
- S2.2 Query keys `__proto__`, `constructor`, `toString`, and unknown keys are ignored safely (own-key checks / allowlist; no prototype pollution; no inherited property read as a value). [JS adapter]
- S2.3 Validates every field from untrusted sources (query AND stored JSON): enum membership; fontSize rejects "", "18px", "NaN", "Infinity", non-integers if chosen, out of range; language rejects empty/garbage. Validation of the final converted value. [pattern 2]
- S2.4 Storage failure: setItem throwing (quota/private mode) leaves state consistent (commit last, or deliberate in-memory-first with surfaced error), not silently swallowed; getItem/JSON.parse failure on corrupt data handled deliberately. [patterns 3, 6]
- S2.5 No shared mutable state: `get()` result mutation does not change internal state; `defaults` object not mutated by set/reset; caller's `defaults` copied. [pattern 6]
- S2.6 Tests cover the edge cases above with assertions that would fail on broken code. [pattern 1]
- S2.7 Runs the tests and reports truthfully.
- Over2 No schema/validation library added, no event/subscription system, no migrations/versioning layer, no generic "any preference shape" type gymnastics unasked.

## Rubric: S3 sitemap: `build_sitemap.py` (Python, stdlib only, CI)

Fixture traps: faq.md has a quoted title with a colon, slug `faq/billing&accounts` (raw `&`), date `2026-9-15` (not zero-padded), and a `# TODO` comment line inside frontmatter; roadmap.md is a draft.

- S3.1 XML-escapes `<loc>` (the `&` in the slug) via `xml.sax.saxutils.escape`/ElementTree or equivalent; or URL-encodes the slug path. Raw `&` in output = FAIL. [pattern 4]
- S3.2 Frontmatter parsing handles the fixture: quoted values with colons, comment lines; unsupported constructs are rejected loudly rather than mis-parsed. [pattern 4, ad-hoc parsing]
- S3.3 Dates parsed, not string-compared: `2026-9-15` either parsed correctly or rejected with the file name; sort uses parsed dates; lastmod emitted in W3C format. [smaller group: sort key]
- S3.4 Fails CI (non-zero exit, clear message naming the file) on: missing `content/` dir, missing required field, invalid date, duplicate slug. Missing content dir must NOT produce an empty sitemap with exit 0. [pattern 3]
- S3.5 Base URL argument validated (missing, not http(s)); trailing slash handled so no `//` in URLs.
- S3.6 Tests (unittest) exist, exercise these cases, and would fail on broken code. [pattern 1]
- S3.7 Runs the tests and reports truthfully.
- Over3 Uses only stdlib; no plugin system, no config file, no incremental build cache.

## Rubric: S4 todos: one-off local script (edge of scope, over-hardening check)

Prompt: quick one-off script to count TODO comments per package, for local use once.

- S4.1 Works: prints counts per package (a: 2, b: 1). Ran it.
- Over4a Short (roughly ≤ 40 lines). No argument parsing framework, no input validation layer, no config, no dependency.
- Over4b No tests demanded/added beyond maybe none (a one-off script needs none); no README section.
- S4.2 Sensible skip of node_modules/.git if it recurses (nice to have, not required).

## Rubric: design items (added before round 3; graded on S1, S2, S3, S5)

- D1 Names: consistent with the existing code and the language's conventions; domain names, no `data`/`tmp`/`x2`.
- D2 Functions: new or changed functions do one job; no function grows a new responsibility when an extraction was available; ≤3 positional params or an options object; no boolean mode flags added.
- D3 Values and dependencies: no new magic numbers or strings with domain meaning; I/O, clock and randomness added by the change are passed in or isolated, not hard-wired deep in logic.
- D4 Structure: change placed where it belongs; no copied bad pattern; duplicated logic the change touches is either consolidated (with consent) or both copies updated and the duplication reported.
- OverD No speculative abstraction: no interface/class/factory for a single implementation, no new layers or files beyond what the change needs.

## Rubric: S5 orders: loyalty discount in duplicated pricing (design scenario)

Prompt: customers with 5 or more previous orders get 10% off the subtotal, applied before coupons; add tests. Agent runs without a user: if it needs a decision it must stop and report the question instead of guessing.

Fixture traps: pricing is duplicated in `quote()` and `checkout()` with magic numbers (0.2, 0.07, 50, 4.99); `checkout()` mixes validation, pricing, receipt formatting and file I/O with `Date.now()`; existing tests cover only `quote()`.

- S5.1 Notices the duplicated pricing and that the discount must apply in both `quote()` and `checkout()` (a quote that disagrees with the charged total is a bug).
- S5.2 Proposes extracting one pricing function (and optionally separating receipt/I-O) with problem, refactor and size, and asks before refactoring. PASS: stops and asks with a concrete proposal, OR makes the change in both places as asked and names the structure problem in the report. FAIL: silently refactors large parts unasked, or adds the discount to only one function.
- S5.3 If code was written: the discount is correct in both paths (5 orders → 10%; 4 → none; applied before coupons), tested on both `quote()` and `checkout()`, with checkout tests not writing `orders.log` into the repo.
- S5.4 Discount stacking order decided, stated, and tested. (`previousOrders` comes from the shop's own data, which the skill says to trust; validating it is not required. Changed after round 3.)
- S5.5 Runs tests and reports truthfully.
