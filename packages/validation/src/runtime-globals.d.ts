/*
 * The globals the runtime code uses beyond ECMAScript, declared as every runtime the package supports
 * provides them: browsers, workers, edge runtimes and Node.js. `tsconfig.json` checks `src` against the
 * ECMAScript library and this file alone, without Node's or the DOM's types, so code that reaches for a
 * global only one runtime has, such as `Buffer` or `document`, fails to compile. Only the members the
 * code uses are declared; add one here when the code needs it, and only if every runtime has it.
 *
 * The tests are checked by `tsconfig.test.json` with Node's types, which declare these globals in full,
 * so that project leaves this file out.
 */

interface URLSearchParams {
  toString(): string;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

declare const URLSearchParams: {
  prototype: URLSearchParams;
  new (init?: string): URLSearchParams;
};

interface URL {
  hostname: string;
  readonly host: string;
  readonly href: string;
  readonly password: string;
  readonly pathname: string;
  readonly port: string;
  readonly protocol: string;
  readonly searchParams: URLSearchParams;
  readonly username: string;
}

declare const URL: {
  prototype: URL;
  new (url: string): URL;
  canParse(url: string): boolean;
  /** Newer than `canParse`: Node.js 22, Chromium 126, Firefox 126 and Safari 18. */
  parse?: (url: string) => URL | null;
};

interface TextDecoder {
  decode(input: Uint8Array): string;
}

declare const TextDecoder: {
  prototype: TextDecoder;
  new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }): TextDecoder;
};

declare function atob(data: string): string;
