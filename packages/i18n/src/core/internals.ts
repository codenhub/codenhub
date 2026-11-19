import type { I18nInitOptions } from "./types";

/** Manager operations the browser entrypoint needs but the public `I18n` type does not expose. @internal */
export interface I18nInternals {
  /**
   * Initializes like `init()`, resolving whether this call applied state rather than being superseded. A call superseded
   * before its loading fails resolves false rather than rejecting.
   */
  init(options: I18nInitOptions): Promise<boolean>;
  /** Looks a key up like `translate()`, reporting a miss, but returns undefined for it rather than the key. */
  lookup(key: string): string | undefined;
  /** The id of the latest `init()` or `setLocale()` request, which a request takes synchronously when it starts. */
  latestRequestId(): number;
  /** Whether the latest `init()` or `setLocale()` request is still loading its dictionaries. */
  isLatestRequestLoading(): boolean;
  /**
   * Resolves after the latest request's loading settles, once that request has applied or failed; at once when nothing
   * is loading. It never rejects.
   */
  latestRequestSettled(): Promise<void>;
  /**
   * Sets the one listener called with a request's id when that request takes effect, before its event, if any. A
   * `setLocale()` to the active locale takes effect at once and dispatches no event. `undefined` removes it.
   */
  setApplyListener(listener: ((requestId: number) => void) | undefined): void;
  /** Makes the request stale when it is still the latest, so a pending load resolves without applying. */
  supersede(requestId: number): void;
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
