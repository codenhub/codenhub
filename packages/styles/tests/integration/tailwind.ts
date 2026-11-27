import { createRequire } from "node:module";

/* The compiler a consumer's Tailwind runs, for the tests that compile `/tw` as
   a consumer does. It is the `@tailwindcss/node` that `@tailwindcss/cli`
   depends on, not the package's own: `@tailwindcss/node` pins `tailwindcss`
   exactly, so the catalog's copy compiles with the catalog's Tailwind even
   when the Tailwind workflow installs another release beside it, and a
   compiler change between the two would pass unseen. The CLI moves with the
   `tailwindcss` that workflow installs and brings the `@tailwindcss/node` of
   its own release.

   It is loaded through `require` from the CLI's own location, since an
   `import` resolves from this file. The specifier is not one TypeScript
   resolves: `@tailwindcss/node` 4.3.4 publishes declarations that import
   files it does not ship (`./ast`, `./compile`, and five more), so a typed
   import fails the typecheck with TS2307, and its `Polyfills` is an ambient
   const enum, which `isolatedModules` rejects. The types below cover the
   calls the tests make. */
type TailwindNode = {
  compile(
    css: string,
    options: { base: string; from: string; polyfills: number; onDependency(path: string): void },
  ): Promise<{ build(candidates: string[]): string }>;
  optimize(css: string, options: { minify: boolean }): { code: string };
  __unstable__loadDesignSystem(css: string, options: { base: string }): Promise<DesignSystem>;
};

/* The calls the tests make on the design system Tailwind sorts and prints candidates with. */
export type DesignSystem = {
  candidatesToCss(candidates: string[]): (string | null)[];
  getClassOrder(classes: string[]): [string, bigint | null][];
};

const requireFromCli = createRequire(import.meta.resolve("@tailwindcss/cli/package.json"));

export const {
  compile,
  optimize,
  __unstable__loadDesignSystem: loadDesignSystem,
} = requireFromCli("@tailwindcss/node") as TailwindNode;

// `Polyfills` in `@tailwindcss/node`.
export const POLYFILLS_NONE = 0;
export const POLYFILLS_ALL = 3;
