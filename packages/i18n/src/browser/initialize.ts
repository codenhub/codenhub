import { I18nError } from "../core/errors";
import { getI18nInternals } from "../core/internals";
import type { I18n } from "../core/types";
import { createDomTranslator, TRANSLATION_KEY_ATTRIBUTES } from "./dom-translation";

const DEFAULT_STORAGE_KEY = "i18n";
const LOCALE_CHANGE_EVENT = "locale-change";
const READY_EVENT = "ready";
const BOUND_MANAGERS = new WeakSet<object>();
const ELEMENT_NODE = 1;

const isElement = (node: Node): node is Element => node.nodeType === ELEMENT_NODE;
const hasTranslationKey = (element: Element): boolean =>
  TRANSLATION_KEY_ATTRIBUTES.some((attribute) => element.hasAttribute(attribute));

/**
 * Optional browser integrations applied around a consumer-owned i18n manager.
 *
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 */
export interface BrowserI18nOptions<TLocale extends string> {
  /** Manager to initialize; it must not have another initializing or active browser binding. */
  i18n: I18n<TLocale>;
  /**
   * Authoritative locale, which takes precedence over persisted and browser preferences.
   * Only `undefined` omits this input; other non-string runtime values reject initialization.
   */
  locale?: TLocale;
  /** Local storage key used for the JSON locale preference. Defaults to `"i18n"`. Requires storage when enabled. */
  storageKey?: string;
  /**
   * Whether a stored locale is read, and explicit or later application-made locales are written. A locale detected
   * from navigator preferences or the default is not written. Defaults to `true`.
   */
  persistLocale?: boolean;
  /** Whether the global document element's `lang` and `dir` stay synchronized. Defaults to `true`. */
  syncDocument?: boolean;
  /** Optional DOM boundary whose safe `data-i18n` leaves and allowlisted `data-i18n-<attribute>` attributes are translated. */
  root?: ParentNode;
  /** Whether additions and translation-key attribute changes below `root` are incrementally observed. Defaults to `false`. */
  observe?: boolean;
}

/** Browser effects exclusively owned for one i18n manager after successful initialization. */
export interface BrowserI18nBinding {
  /**
   * Stops locale-change handling and mutation observation.
   *
   * Existing DOM text, document attributes, persisted state, and core i18n state are unchanged.
   * Manager ownership is released, so a new browser binding may then be initialized.
   */
  disconnect(): void;
}

interface StoredLocale {
  readonly locale: unknown;
}

const warn = (i18n: I18n, message: string, cause: unknown): void => {
  if (!i18n.isSilent) {
    console.warn(message, cause);
  }
};

const readPersistedLocale = <TLocale extends string>(i18n: I18n<TLocale>, storageKey: string): TLocale | undefined => {
  try {
    const storedValue = localStorage.getItem(storageKey);

    if (storedValue === null) {
      return undefined;
    }

    const storedLocale = JSON.parse(storedValue) as StoredLocale;
    return typeof storedLocale?.locale === "string" ? i18n.resolveLocale(storedLocale.locale) : undefined;
  } catch (cause) {
    warn(i18n, "[I18n] Could not read persisted locale.", cause);
    return undefined;
  }
};

const persistLocale = <TLocale extends string>(i18n: I18n<TLocale>, storageKey: string): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ locale: i18n.locale }));
  } catch (cause) {
    warn(i18n, "[I18n] Could not persist locale.", cause);
  }
};

const getNavigatorPreferences = (): readonly string[] => {
  return navigator.languages.length > 0 ? navigator.languages : navigator.language ? [navigator.language] : [];
};

const syncDocumentLocale = (i18n: I18n): void => {
  document.documentElement.lang = i18n.locale;
  document.documentElement.dir = i18n.direction;
};

const getMutationObserver = (root: ParentNode): typeof MutationObserver => {
  const ownerDocument = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
  return ownerDocument?.defaultView?.MutationObserver ?? MutationObserver;
};

/**
 * Initializes core i18n using browser locale precedence and binds optional browser effects.
 *
 * Locale selection uses explicit input, valid persisted state, navigator preferences, then
 * the configured default. Storage failures are recoverable and warn unless the manager is
 * silent. Only one call may initialize or own a binding for a manager at a time. Setup is
 * transactional: failed initialization or browser setup releases all binding-owned resources.
 * When the loader rejects for a stored or detected locale, it warns unless silent and initializes the default locale
 * without persisting it. Other required dictionary loading and validation failures reject unchanged.
 *
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 * @param options - Core manager, locale inputs, persistence, document, and optional DOM behavior.
 * @returns A binding that disconnects browser-owned listeners and observation.
 * @throws {TypeError} When observation lacks a root, the manager was not created by `createI18n()`, or it already has a
 * browser binding.
 * @throws {RangeError} When an explicit locale is unsupported or is not a string at runtime.
 * @throws {Error} When another core initialization supersedes this call before its locale becomes active.
 * @throws {TypeError} When a required dictionary is invalid.
 * @throws {TypeError} When direction resolution returns a value other than `ltr` or `rtl`.
 * @throws {I18nError} When the loader rejects for an explicit locale or the default locale.
 * Exceptions from the direction callback and required browser setup propagate unchanged.
 */
export async function initializeBrowserI18n<TLocale extends string>(
  options: BrowserI18nOptions<TLocale>,
): Promise<BrowserI18nBinding> {
  const {
    i18n,
    locale,
    storageKey = DEFAULT_STORAGE_KEY,
    persistLocale: shouldPersistLocale = true,
    syncDocument: shouldSyncDocument = true,
    observe = false,
  } = options;
  let root = options.root;

  if (observe && root === undefined) {
    throw new TypeError("[I18n] Browser observation requires a root.");
  }

  if (BOUND_MANAGERS.has(i18n)) {
    throw new TypeError("[I18n] The manager already has a browser binding.");
  }

  const internals = getI18nInternals(i18n);
  BOUND_MANAGERS.add(i18n);

  const domTranslator = createDomTranslator({ isSilent: i18n.isSilent });
  const applyEffects = (shouldPersist: boolean): void => {
    if (shouldPersist) {
      persistLocale(i18n, storageKey);
    }
    if (shouldSyncDocument) {
      syncDocumentLocale(i18n);
    }
    if (root !== undefined) {
      // The full pass covers pending additions and key changes but does not find an element whose last key was removed,
      // so only those are handled first; the other pending records are dropped with the pass's own writes below.
      if (observer !== undefined) {
        const keyRemovedElements = new Set<Element>();

        for (const mutation of observer.takeRecords()) {
          if (mutation.type === "attributes" && !hasTranslationKey(mutation.target as Element)) {
            keyRemovedElements.add(mutation.target as Element);
          }
        }
        for (const element of keyRemovedElements) {
          domTranslator.translateRoot({ root: element, boundary: root, translate: (key) => internals.lookup(key) });
        }
      }
      domTranslator.translateRoot({ root, translate: (key) => internals.lookup(key) });
      // The records left are the full pass's own writes, which need no second pass.
      observer?.takeRecords();
    }
  };
  const handleMutations = (mutations: readonly MutationRecord[]): void => {
    const observedRoot = root;

    if (observedRoot === undefined) {
      return;
    }

    const changedRoots = new Set<Element>();
    // An element whose last key was removed is not found by an ancestor's scan, so it is translated directly.
    const keyRemovedElements = new Set<Element>();

    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        const target = mutation.target as Element;
        changedRoots.add(target);
        if (!hasTranslationKey(target)) {
          keyRemovedElements.add(target);
        }
        continue;
      }

      if (isElement(mutation.target) && mutation.target.hasAttribute("data-i18n")) {
        changedRoots.add(mutation.target);
      }

      for (const addedNode of mutation.addedNodes) {
        if (isElement(addedNode)) {
          changedRoots.add(addedNode);
        }
      }
    }

    for (const changedRoot of changedRoots) {
      let ancestor = changedRoot.parentElement;
      let hasChangedAncestor = false;

      while (ancestor !== null) {
        if (changedRoots.has(ancestor)) {
          hasChangedAncestor = true;
          break;
        }

        ancestor = ancestor.parentElement;
      }

      if (hasChangedAncestor && !keyRemovedElements.has(changedRoot)) {
        continue;
      }

      domTranslator.translateRoot({
        root: changedRoot,
        boundary: observedRoot,
        translate: (key) => internals.lookup(key),
      });
    }
  };
  // Later core changes are choices the application made, so they persist when enabled.
  const applyBrowserEffects = (): void => applyEffects(shouldPersistLocale);
  let observer: MutationObserver | undefined;
  let isReadyListenerAdded = false;
  let isLocaleChangeListenerAdded = false;
  let isCleaned = false;

  const cleanup = (): void => {
    if (isCleaned) {
      return;
    }

    isCleaned = true;
    if (isReadyListenerAdded) {
      i18n.removeEventListener(READY_EVENT, applyBrowserEffects);
    }
    if (isLocaleChangeListenerAdded) {
      i18n.removeEventListener(LOCALE_CHANGE_EVENT, applyBrowserEffects);
    }
    observer?.disconnect();
    observer = undefined;
    root = undefined;
    BOUND_MANAGERS.delete(i18n);
  };

  try {
    let initialLocale: TLocale;

    if (locale !== undefined) {
      if (typeof locale !== "string") {
        throw new RangeError("[I18n] An explicit browser locale must be a string.");
      }
      initialLocale = locale;
    } else {
      initialLocale =
        (shouldPersistLocale ? readPersistedLocale(i18n, storageKey) : undefined) ??
        i18n.matchLocale(getNavigatorPreferences()) ??
        i18n.defaultLocale;
    }

    let wasInitializationApplied: boolean;

    try {
      wasInitializationApplied = await internals.init({ locale: initialLocale });
    } catch (error) {
      // A stored or detected locale is a preference, not a requirement: when its loader fails, the default still serves
      // the user, and it is not persisted, so a later visit tries the preference again.
      // The default loads beside the preference, so a rejection of the default itself is not a preference failure.
      if (
        locale !== undefined ||
        !(error instanceof I18nError) ||
        initialLocale === i18n.defaultLocale ||
        error.locale === i18n.defaultLocale
      ) {
        throw error;
      }

      warn(i18n, `[I18n] Could not load locale "${initialLocale}"; using the default locale.`, error);
      initialLocale = i18n.defaultLocale;
      wasInitializationApplied = await internals.init({ locale: initialLocale });
    }

    if (!wasInitializationApplied || !i18n.isReady || i18n.locale !== i18n.resolveLocale(initialLocale)) {
      throw new Error("[I18n] Browser initialization was superseded before its locale became active.");
    }

    if (observe && root !== undefined) {
      const observedRoot = root;
      observer = new (getMutationObserver(observedRoot))((mutations) => {
        handleMutations(mutations);
        // The records left are the handler's own writes, which need no second pass.
        observer?.takeRecords();
      });
      observer.observe(observedRoot, {
        attributes: true,
        attributeFilter: [...TRANSLATION_KEY_ATTRIBUTES],
        childList: true,
        subtree: true,
      });
    }

    // A detected locale is not persisted, so a later visit detects again instead of keeping a stale fallback.
    applyEffects(shouldPersistLocale && locale !== undefined);
    i18n.addEventListener(READY_EVENT, applyBrowserEffects);
    isReadyListenerAdded = true;
    i18n.addEventListener(LOCALE_CHANGE_EVENT, applyBrowserEffects);
    isLocaleChangeListenerAdded = true;

    return { disconnect: cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
