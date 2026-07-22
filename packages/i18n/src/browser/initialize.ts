import type { I18n } from "../core/types";
import { createDomTranslator } from "./dom-translation";

const DEFAULT_STORAGE_KEY = "i18n";
const LOCALE_CHANGE_EVENT = "locale-change";
const READY_EVENT = "ready";
const BOUND_MANAGERS = new WeakSet<object>();
const ELEMENT_NODE = 1;

const isElement = (node: Node): node is Element => node.nodeType === ELEMENT_NODE;

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
  /** Whether successful active locales are read from and written to storage. Defaults to `true`. */
  persistLocale?: boolean;
  /** Whether the global document element's `lang` and `dir` stay synchronized. Defaults to `true`. */
  syncDocument?: boolean;
  /** Optional DOM boundary whose safe `data-i18n` leaves are translated. */
  root?: ParentNode;
  /** Whether additions and `data-i18n` changes below `root` are incrementally observed. Defaults to `false`. */
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

const resolveBrowserLocale = <TLocale extends string>(i18n: I18n<TLocale>): TLocale | undefined => {
  for (const preference of getNavigatorPreferences()) {
    const exactLocale = i18n.resolveLocale(preference);

    if (exactLocale !== undefined) {
      return exactLocale;
    }

    const language = preference.trim().split("-")[0]?.toLowerCase();
    const subtagLocale = i18n.locales.find((locale) => locale.toLowerCase().split("-")[0] === language);

    if (subtagLocale !== undefined) {
      return subtagLocale;
    }
  }

  return undefined;
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
 * Required dictionary loading and validation failures reject unchanged.
 *
 * @typeParam TLocale - Union of supported canonical locale identifiers.
 * @param options - Core manager, locale inputs, persistence, document, and optional DOM behavior.
 * @returns A binding that disconnects browser-owned listeners and observation.
 * @throws {TypeError} When observation lacks a root or the manager already has a browser binding.
 * @throws {RangeError} When an explicit locale is unsupported or is not a string at runtime.
 * @throws {Error} When another core initialization supersedes this call before its locale becomes active.
 * @throws {TypeError} When a required dictionary is invalid.
 * @throws {TypeError} When direction resolution returns a value other than `ltr` or `rtl`.
 * @throws {I18nError} When a required locale loader rejects.
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

  BOUND_MANAGERS.add(i18n);

  const domTranslator = createDomTranslator({ isSilent: i18n.isSilent });
  const applyBrowserEffects = (): void => {
    if (shouldPersistLocale) {
      persistLocale(i18n, storageKey);
    }
    if (shouldSyncDocument) {
      syncDocumentLocale(i18n);
    }
    if (root !== undefined) {
      domTranslator.translateRoot({ root, translate: (key) => i18n.translate(key) });
    }
  };
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
        resolveBrowserLocale(i18n) ??
        i18n.defaultLocale;
    }

    await i18n.init({ locale: initialLocale });

    if (!i18n.isReady || i18n.locale !== i18n.resolveLocale(initialLocale)) {
      throw new Error("[I18n] Browser initialization was superseded before its locale became active.");
    }

    if (observe && root !== undefined) {
      const observedRoot = root;
      observer = new (getMutationObserver(observedRoot))((mutations) => {
        const changedRoots = new Set<ParentNode>();

        for (const mutation of mutations) {
          if (mutation.type === "attributes") {
            changedRoots.add(mutation.target as Element);
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
          domTranslator.translateRoot({
            root: changedRoot,
            boundary: observedRoot,
            translate: (key) => i18n.translate(key),
          });
        }
      });
      observer.observe(observedRoot, {
        attributes: true,
        attributeFilter: ["data-i18n"],
        childList: true,
        subtree: true,
      });
    }

    applyBrowserEffects();
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
