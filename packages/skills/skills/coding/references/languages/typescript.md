# TypeScript and JavaScript

Traps that the general rules point at, as they show up in TypeScript, JavaScript, and Node. Unmarked items hold in every Node and TypeScript release still in use. Items that need a newer version name it; before relying on one, check the project's Node version (`engines`, `.nvmrc`, `.node-version`, or CI config) and its `typescript` version.

## Conventions when the project has none

- Turn on `strict` in `tsconfig.json`, and `noUncheckedIndexedAccess` in a new project, so `arr[i]` and `record[key]` include `undefined`. Prefer `unknown` to `any`, narrow it where the value enters, and keep any cast narrow and at that boundary.
- Use `interface` for object shapes and `type` for unions and intersections. Import types with `import type`.
- Use named exports. An `index.ts` re-exports a folder's public surface and nothing else; never import another package's files except through its `exports`.
- Use `const`, `let` only when the binding is reassigned, never `var`.
- Write `async`/`await` rather than `.then` chains, run independent work with `Promise.all`, and await or explicitly handle every promise; a floating promise loses its error.
- `Promise.all` rejects on the first failure and leaves the other work running. Use `Promise.allSettled` when every result or failure matters, and abort the rest through a shared `AbortSignal` when one failure ends the work.
- Name files in kebab-case, types and classes in PascalCase, values and functions in camelCase, and constants with domain meaning in UPPER_SNAKE_CASE.
- Document exported symbols with TSDoc: a one-sentence summary, `@param`, `@returns`, one `@throws` per error type with its condition, and `@defaultValue` for optional settings.

## Numbers and conversion

- `Number("")` and `Number("  ")` are `0`, `parseInt("10s")` is `10`, `Number("0x10")` is `16`, and `Number("1e3")` is `1000`. Reject empty and whitespace-only strings first, convert with `Number`, then check `Number.isFinite` (and `Number.isInteger` when only integers make sense). Use a regex on the raw string when the accepted spelling matters.
- `setTimeout` and `setInterval` accept at most 2,147,483,647 ms. Node replaces a larger delay with 1 ms and only prints a warning, so a timeout of 25 days fires at once. Check the delay after converting units.
- `arr.sort()` without a comparator compares as strings: `[10, 9, 1].sort()` is `[1, 10, 9]`. Pass a comparator, `(a, b) => a - b` for numbers or `Intl.Collator` with a locale for text, and use `toSorted` (Node 20+) when the original array must not change.
- Array lengths, `Buffer.alloc`, and `String.prototype.repeat` throw `RangeError` past their limits; check sizes that come from input.

## Objects used as maps

- A plain object keyed by input inherits `__proto__`, `constructor`, and `toString`. Use `Map`, `Object.create(null)`, or an allowlist of known keys, and read with `Object.hasOwn` (Node 16.9+; `Object.prototype.hasOwnProperty.call` before that), never `key in obj` or `obj[key] !== undefined`. Use `Reflect.ownKeys` when symbol keys matter.
- `{ ...defaults, ...options }` copies an explicit `undefined` over the default. Drop `undefined` entries before merging, or decide that `undefined` clears the field, and test the call shape `set({ field: undefined })` either way. Enable `exactOptionalPropertyTypes` (TypeScript 4.4+) when the project allows it, so the type says which is meant.
- `JSON.parse` of stored or received data returns `unknown` in practice: validate every field before using it, and handle the parse throwing on corrupt data.
- Return copies of internal objects and arrays (`structuredClone`, Node 17+, or a spread for flat data), and copy a caller's object you keep.

## Strings and text in other languages

- `str.replace(pattern, replacement)` expands `$&`, `$1`, and `$$` in a string replacement. Pass a function, `() => replacement`, when the replacement comes from data.
- `JSON.stringify` inside an inline `<script>` does not escape `</script`, `<!--`, U+2028, or U+2029. Replace every `<` with the escape `\u003c` (`json.replace(/</g, "\\u003c")`) and escape both line separators as `\u2028` and `\u2029`.
- `innerHTML` and template literals with data are an injection sink. Use `textContent`, DOM APIs, or the framework's escaping.
- `\s` matches non-breaking space and other Unicode spaces. Write `[ \t\n\r\f]` when a spec means ASCII whitespace. `str.isWellFormed()` (Node 20+) detects lone surrogates.
- A regex with the `g` or `y` flag keeps `lastIndex` between `test()` and `exec()` calls; do not reuse one across inputs.

## Dates and locale

- `new Date(string)` is implementation-defined for anything but full ISO 8601, and `new Date(2026, 1, 31)` rolls over to March. Parse with an explicit format, then check the parts round-trip.
- `localeCompare` and `toLocaleString` without a locale depend on the host. Pass the locale, and `timeZone` for dates.

## Child processes and streams

- With `shell: true`, `child.kill()` stops the shell, not the command it started. To stop the tree, spawn with `detached: true` on POSIX and call `process.kill(-child.pid, signal)`; on Windows run `taskkill /pid <pid> /T /F`. A detached group no longer receives the terminal's Ctrl+C, so forward `SIGINT` and `SIGTERM` to it, and report the change.
- `spawnSync`'s `timeout` signals only the direct child, which is the shell under `shell: true`.
- On Windows, `shell: true` runs `cmd.exe`, which mangles quotes and braces in inline code such as `node -e "..."`. Write test helper programs to files in the test's temporary directory and run those.
- Settle a child's promise once: `error` and `close` can both fire, and a timer must be cleared on every exit path.
- A stream without an `'error'` listener crashes the process on `EPIPE` or `ECONNRESET`. Attach one to every stream you create or pipe.
- Decoding each chunk with `toString()` splits multibyte characters across chunks. Call `setEncoding('utf8')` or use a `TextDecoder` with `stream: true`.
- `arr.push(...items)` and `Math.max(...items)` throw `RangeError` on large arrays; the limit depends on the engine's stack and can be under 200,000 items. Loop, or use `reduce`.

## Errors and realms

- Branch on `error.code` (`ENOENT`, `EEXIST`) or a class you own, never on `error.message`.
- Web Storage's `getItem` returns `null` for a missing key. A throw means storage is unavailable or the adapter is broken, not that the key is absent; decide what happens and test it.
- `instanceof` fails for objects from another realm: iframes, `vm` contexts, workers, and duplicated package copies. Check a brand or use `Array.isArray`, or `Error.isError` (Node 24+).
- `catch (error)` receives `unknown`. Narrow it before reading properties, and rethrow what you do not handle.

## Types

- A type that the runtime does not honor is a bug: a conditional type that always resolves to `unknown`, a predicate that narrows to `never`, an async function matching a sync overload, an encoder typed with the decoded type. When exporting a generic or overloaded API, add a type-level test (`expectTypeOf` in Vitest, or `// @ts-expect-error` lines) next to a runtime assertion.
- Changing an exported function from sync to async, or from throwing to returning an error, is a public API change (rule 7).

## Packages

- When publishing a library that shares state or identity with the application, such as a framework, a registry, or a class checked with `instanceof`, declare it in `peerDependencies` with a range compatible with the application's version, and check the installed tree (`npm ls <name>`, `pnpm why <name>`) for a single copy; incompatible ranges still install two.

## Running TypeScript directly in Node

- Node's built-in type stripping (on by default from Node 22.18 and 23.6; behind `--experimental-strip-types` from 22.6) rejects `enum`, `namespace` with values, parameter properties (`constructor(private x)`), and `import =`, while `tsc` and test runners accept them. When the project runs `.ts` files with `node`, use plain unions and explicit fields, and enable `erasableSyntaxOnly` (TypeScript 5.8+) when the project allows it.
- Relative imports need the `.ts` extension when Node runs the source directly.
