import type { I18nInitOptions } from "./types";

/** Manager operations the browser entrypoint needs but the public `I18n` type does not expose. @internal */
export interface I18nInternals {
  /** Initializes like `init()`, resolving whether this call applied state rather than being superseded. */
  init(options: I18nInitOptions): Promise<boolean>;
  /** Looks a key up like `translate()`, reporting a miss, but returns undefined for it rather than the key. */
  lookup(key: string): string | undefined;
}

const internals = new WeakMap<object, I18nInternals>();

/** @internal */
export const registerI18nInternals = (i18n: object, value: I18nInternals): void => {
  internals.set(i18n, value);
};

/**
 * Returns the internals of a manager made by `createI18n()`.
 *
 * @throws {TypeError} When the manager was not made by `createI18n()`.
 * @internal
 */
export const getI18nInternals = (i18n: object): I18nInternals => {
  const value = internals.get(i18n);

  if (value === undefined) {
    throw new TypeError("[I18n] The manager must be created by createI18n().");
  }

  return value;
};
