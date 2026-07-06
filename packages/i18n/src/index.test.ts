// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createI18n, type I18nConfig, type I18n } from "./index";

const LOCALES = ["en-US", "pt-BR"] as const;
type Locale = (typeof LOCALES)[number];

const DEFAULT_LOCALE = "en-US" as const;
const getLocaleFile = (locale: Locale): string => `/data/locales/${locale}.json`;
const i18nConfig: I18nConfig<Locale> = {
  defaultLocale: DEFAULT_LOCALE,
  locales: LOCALES,
  getLocaleFile,
  getLocaleDirection: () => "ltr",
  isLocale: (value: string): value is Locale => LOCALES.includes(value as Locale),
};

const EN_US_URL = getLocaleFile("en-US");
const PT_BR_URL = getLocaleFile("pt-BR");

const localeResponses = {
  [EN_US_URL]: {
    "home.hero.headline": "This is a headline",
    "home.hero.description": "Lorem ipsum dolor sit amet consectetur adipisicing elit.",
    "home.hero.cta": "Get started",
    "home.hero.secondaryCta": "Learn more",
  },
  [PT_BR_URL]: {
    "home.hero.headline": "Este é um título",
    "home.hero.description": "Lorem ipsum dolor sit amet consectetur adipisicing elit.",
    "home.hero.cta": "Comece agora",
    "home.hero.secondaryCta": "Saiba mais",
  },
};

interface FetchResponseOverride {
  body?: unknown;
  ok?: boolean;
  status?: number;
  delayMs?: number;
  rejectWith?: Error;
  malformedJson?: boolean;
}

/**
 * Waits for `delayMs` unless `signal` aborts first, mirroring how a real fetch
 * rejects when its abort signal fires before the response arrives.
 */
const waitForOrAbort = (delayMs: number, signal?: AbortSignal): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timeoutId);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
};

const createFetchResponse = async (
  url: string,
  overrides: Record<string, FetchResponseOverride>,
  signal?: AbortSignal,
): Promise<Response> => {
  const override = overrides[url];

  if (override?.delayMs !== undefined) {
    await waitForOrAbort(override.delayMs, signal);
  }

  if (override?.rejectWith !== undefined) {
    throw override.rejectWith;
  }

  const body = override?.body ?? localeResponses[url as keyof typeof localeResponses];
  const ok = override?.ok ?? body !== undefined;
  // Default failures to a retryable status so existing fetch-failure tests
  // still exercise the retry path; non-retryable cases pass status explicitly.
  const status = override?.status ?? (ok ? 200 : 503);

  return {
    ok,
    status,
    json: async () => {
      if (override?.malformedJson === true) {
        throw new SyntaxError("Unexpected token in JSON");
      }

      return body;
    },
  } as Response;
};

const stubNavigatorLanguages = (languages: string[]): void => {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages as unknown as readonly string[]);
};

describe("I18n", () => {
  let i18n: I18n<Locale>;
  let fetchOverrides: Record<string, FetchResponseOverride>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    i18n = createI18n(i18nConfig);
    fetchOverrides = {};
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal ?? undefined;

        if (typeof input === "string") {
          return createFetchResponse(input, fetchOverrides, signal);
        }

        if (input instanceof URL) {
          return createFetchResponse(input.pathname, fetchOverrides, signal);
        }

        return createFetchResponse(new URL(input.url).pathname, fetchOverrides, signal);
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("should return false and warn when setLocale is called before init", async () => {
    expect(await i18n.setLocale("pt-BR")).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("called before init"));
    expect(i18n.locale).toBe("en-US");
  });

  it("should return undefined and warn when translate is called before init", () => {
    expect(i18n.translate("home.hero.cta")).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("called before init"));
  });

  it("should detect the browser locale for first-time visitors (exact match)", async () => {
    stubNavigatorLanguages(["pt-BR", "en-US"]);
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Comece agora");
  });

  it("should detect the browser locale for first-time visitors via language subtag prefix", async () => {
    // "pt" is not an exact locale match but should resolve to "pt-BR".
    stubNavigatorLanguages(["pt"]);
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Comece agora");
  });

  it("should detect the browser locale case-insensitively", async () => {
    // navigator.language casing is not guaranteed; "PT-br" must still resolve.
    stubNavigatorLanguages(["PT-br"]);
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Comece agora");
  });

  it("should prefer an exact locale match over a subtag match from an earlier browser preference", async () => {
    // "pt-PT" is not in the manifest so it would subtag-match to "pt-BR", but
    // "en-US" is an exact match later in the list. The two-pass approach must
    // exhaust exact matches before trying subtag matches, so "en-US" wins.
    stubNavigatorLanguages(["pt-PT", "en-US"]);
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("en-US");
    expect(document.querySelector("p")?.textContent).toBe("Get started");
  });

  it("should not override a persisted locale with the browser language", async () => {
    stubNavigatorLanguages(["pt-BR"]);
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "en-US" }));
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("en-US");
    expect(document.querySelector("p")?.textContent).toBe("Get started");
  });

  it("should start not ready", () => {
    expect(i18n.isReady).toBe(false);
  });

  it("should initialize with the default locale and translate matching DOM elements", async () => {
    document.body.innerHTML = `
      <h1 data-i18n="home.hero.headline">Old title</h1>
      <p data-i18n="home.hero.description">Old greeting</p>
      <span>Untouched</span>
    `;

    await i18n.init();

    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.querySelector("h1")?.textContent).toBe("This is a headline");
    expect(document.querySelector("p")?.textContent).toBe("Lorem ipsum dolor sit amet consectetur adipisicing elit.");
    expect(document.querySelector("span")?.textContent).toBe("Untouched");
    expect(fetch).toHaveBeenCalledWith(
      "/data/locales/en-US.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("should restore a persisted locale when it matches exactly", async () => {
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Comece agora");
  });

  it("should fall back to en-US when the persisted locale is not a valid exact match", async () => {
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "en" }));
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("en-US");
    expect(document.querySelector("p")?.textContent).toBe("Get started");
  });

  it("should keep the current text when the translation key is missing or empty", async () => {
    document.body.innerHTML = `
      <p data-i18n="missing">Keep missing</p>
      <p data-i18n="">Keep empty</p>
    `;

    await i18n.init();

    const paragraphs = document.querySelectorAll("p");

    expect(paragraphs[0]?.textContent).toBe("Keep missing");
    expect(paragraphs[1]?.textContent).toBe("Keep empty");
  });

  it("should expose a translate function for manual usage", async () => {
    await i18n.init();

    expect(i18n.translate("home.hero.cta")).toBe("Get started");
    expect(i18n.translate("missing")).toBeUndefined();
  });

  it("should persist the locale change, retranslate the DOM, and emit a locale-change event", async () => {
    const listener = vi.fn();

    document.body.innerHTML = `<p data-i18n="home.hero.secondaryCta">Old greeting</p>`;
    i18n.addEventListener("locale-change", listener as EventListener);
    await i18n.init({ storageKey: "test-i18n" });

    expect(await i18n.setLocale("pt-BR")).toBe(true);

    expect(i18n.locale).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Saiba mais");
    expect(localStorage.getItem("test-i18n")).toBe(JSON.stringify({ locale: "pt-BR" }));
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0];

    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).detail).toEqual({
      locale: "pt-BR",
      previousLocale: "en-US",
    });
  });

  it("should emit locale-change when fallback switches the active locale during setLocale", async () => {
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });
    expect(i18n.locale).toBe("pt-BR");

    const listener = vi.fn();
    i18n.addEventListener("locale-change", listener as EventListener);

    // en-US is the default and the only fallback; failing it switches the active locale
    // from pt-BR to en-US (fallback), so locale-change must fire.
    fetchOverrides[EN_US_URL] = { ok: false, status: 404 };

    expect(await i18n.setLocale("en-US")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0];
    expect((event as CustomEvent).detail).toEqual({
      locale: "en-US",
      previousLocale: "pt-BR",
    });
  });

  it("should not emit locale-change when the active locale remains unchanged on load failure", async () => {
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;
    await i18n.init();
    expect(i18n.locale).toBe("en-US");

    const listener = vi.fn();
    i18n.addEventListener("locale-change", listener as EventListener);

    // pt-BR fails to load and falls back to en-US. Active locale stays en-US, so no event fires.
    fetchOverrides[PT_BR_URL] = { ok: false, status: 503 };

    expect(await i18n.setLocale("pt-BR")).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("should ignore invalid locale changes", async () => {
    await i18n.init();

    expect(await i18n.setLocale("en")).toBe(false);
    expect(i18n.locale).toBe("en-US");
  });

  it("should accept locale changes case-insensitively", async () => {
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init();

    expect(await i18n.setLocale("pt-br")).toBe(true);
    expect(i18n.locale).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Comece agora");
  });

  it("should emit a ready event after initialization", async () => {
    const listener = vi.fn();

    i18n.addEventListener("ready", listener as EventListener);
    await i18n.init();

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0];

    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).detail).toEqual({
      locale: "en-US",
      hasTranslationsAvailable: true,
    });
  });

  it("should report translationsAvailable false on ready when every locale fails to load", async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    fetchOverrides[EN_US_URL] = { ok: false };

    i18n.addEventListener("ready", listener as EventListener);
    const initPromise = i18n.init();
    await vi.runAllTimersAsync();
    await initPromise;

    expect(i18n.isReady).toBe(true);
    const event = listener.mock.calls[0]?.[0];

    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).detail).toEqual({
      locale: "en-US",
      hasTranslationsAvailable: false,
    });
  });

  it("should warn when a locale file loads successfully but contains no translations", async () => {
    fetchOverrides[EN_US_URL] = { body: {} };

    await i18n.init();

    expect(i18n.isReady).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Locale "en-US" loaded successfully but contains no translations'),
    );
  });

  it("should retry an empty locale file on setLocale and apply translations once content is available", async () => {
    fetchOverrides[EN_US_URL] = { body: {} };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init();

    expect(i18n.translate("home.hero.cta")).toBeUndefined();
    expect(document.querySelector("p")?.textContent).toBe("Old greeting");

    // Server now returns real content — setLocale must re-fetch instead of
    // short-circuiting on the cached empty result.
    delete fetchOverrides[EN_US_URL];

    expect(await i18n.setLocale("en-US")).toBe(true);
    expect(i18n.translate("home.hero.cta")).toBe("Get started");
    expect(document.querySelector("p")?.textContent).toBe("Get started");
  });

  it("should skip custom elements during automatic document translation", async () => {
    document.body.innerHTML = `
      <h1 data-i18n="home.hero.headline">Page title</h1>
      <custom-card data-i18n="home.hero.headline">Component title</custom-card>
      <custom-card>
        <span data-i18n="home.hero.cta">Component greeting</span>
      </custom-card>
    `;

    await i18n.init();

    expect(document.querySelector("h1")?.textContent).toBe("This is a headline");
    expect(document.querySelector("custom-card")?.textContent?.trim()).toBe("Component title");
    expect(document.querySelector("custom-card span")?.textContent).toBe("Component greeting");
  });

  it("should skip a custom element when it is the translation root", async () => {
    document.body.innerHTML = `
      <custom-card>
        <span data-i18n="home.hero.cta">Component greeting</span>
      </custom-card>
    `;

    const root = document.querySelector("custom-card");

    if (root === null) {
      throw new Error("custom-card root was not rendered");
    }

    await i18n.init({ root });

    expect(document.querySelector("custom-card span")?.textContent).toBe("Component greeting");
  });

  it("should fall back to the default locale when a persisted locale fails to load", async () => {
    vi.useFakeTimers();
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    fetchOverrides[PT_BR_URL] = { ok: false };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    const initPromise = i18n.init({ storageKey: "test-i18n" });
    await vi.runAllTimersAsync();
    await initPromise;

    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("en-US");
    expect(document.querySelector("p")?.textContent).toBe("Get started");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Falling back to default locale "en-US"'));
  });

  it("should not overwrite the persisted locale when it fails to load", async () => {
    vi.useFakeTimers();
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    fetchOverrides[PT_BR_URL] = { ok: false };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    const initPromise = i18n.init({ storageKey: "test-i18n" });
    await vi.runAllTimersAsync();
    await initPromise;

    expect(i18n.locale).toBe("en-US");
    // The transient failure must not destroy the visitor's stored preference,
    // otherwise the fallback locale would stick on every later visit.
    expect(localStorage.getItem("test-i18n")).toBe(JSON.stringify({ locale: "pt-BR" }));
  });

  it("should retry a failed locale fetch and succeed on a later attempt", async () => {
    vi.useFakeTimers();
    let fetchCallCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCallCount++;
        if (fetchCallCount < 3) {
          return { ok: false, status: 503, json: async () => null } as Response;
        }
        return { ok: true, status: 200, json: async () => localeResponses[EN_US_URL] } as Response;
      }),
    );

    const initPromise = i18n.init();
    await vi.runAllTimersAsync();
    await initPromise;

    expect(i18n.locale).toBe("en-US");
    expect(fetchCallCount).toBe(3); // 2 failures then success on the 3rd attempt
  });

  it("should back off between retries instead of refetching immediately", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503, json: async () => null }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const initPromise = i18n.init();

    // The first attempt fires right away; flushing microtasks must not trigger
    // the retry, because it is deferred behind a backoff delay.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.runAllTimersAsync();
    await initPromise;

    // 1 initial attempt + 3 retries, each fired once its backoff delay elapsed.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("should fail fast without retrying a non-retryable HTTP error", async () => {
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    fetchOverrides[PT_BR_URL] = { ok: false, status: 404 };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("en-US");
    expect(document.querySelector("p")?.textContent).toBe("Get started");

    const ptBrCalls = vi.mocked(fetch).mock.calls.filter(([url]) => url === PT_BR_URL);
    expect(ptBrCalls).toHaveLength(1);
  });

  it("should abort a stalled locale request and fall back to the default locale", async () => {
    vi.useFakeTimers();
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    // A request that never settles on its own must be aborted by the fetch
    // timeout, otherwise init() would hang forever.
    fetchOverrides[PT_BR_URL] = { delayMs: 60_000 };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    const initPromise = i18n.init({ storageKey: "test-i18n" });
    await vi.runAllTimersAsync();
    await initPromise;

    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("en-US");
    expect(document.querySelector("p")?.textContent).toBe("Get started");
  });

  it("should treat a malformed locale file as a permanent failure without retrying", async () => {
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    fetchOverrides[PT_BR_URL] = { malformedJson: true };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("en-US");
    expect(document.querySelector("p")?.textContent).toBe("Get started");

    // Malformed JSON cannot improve on retry, so pt-BR is fetched exactly once.
    const ptBrCalls = vi.mocked(fetch).mock.calls.filter(([url]) => url === PT_BR_URL);
    expect(ptBrCalls).toHaveLength(1);
  });

  it("should not resolve inherited Object keys as translations after a load failure", async () => {
    fetchOverrides[EN_US_URL] = { ok: false, status: 404 };

    await i18n.init();

    expect(i18n.isReady).toBe(true);
    expect(i18n.translate("constructor")).toBeUndefined();
    expect(i18n.translate("toString")).toBeUndefined();
  });

  it("should retry a previously failed locale on an explicit setLocale call", async () => {
    vi.useFakeTimers();
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    fetchOverrides[PT_BR_URL] = { ok: false };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    const initPromise = i18n.init({ storageKey: "test-i18n" });
    await vi.runAllTimersAsync();
    await initPromise;

    // pt-BR failed to load, so init fell back to the default locale.
    expect(i18n.locale).toBe("en-US");

    // Network recovered: an explicit switch to pt-BR must retry the fetch
    // instead of short-circuiting on the cached failure.
    delete fetchOverrides[PT_BR_URL];

    expect(await i18n.setLocale("pt-BR")).toBe(true);
    expect(i18n.locale).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Comece agora");
  });

  it("should retry the active locale on setLocale when its dictionary failed to load", async () => {
    vi.useFakeTimers();
    fetchOverrides[EN_US_URL] = { ok: false };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    const initPromise = i18n.init();
    await vi.runAllTimersAsync();
    await initPromise;

    // The default locale failed transiently, so translations are unavailable.
    expect(i18n.locale).toBe("en-US");
    expect(i18n.translate("home.hero.cta")).toBeUndefined();

    // Network recovered: re-selecting the already-active locale must retry the
    // fetch instead of short-circuiting on the unloaded dictionary.
    delete fetchOverrides[EN_US_URL];

    expect(await i18n.setLocale("en-US")).toBe(true);
    expect(i18n.translate("home.hero.cta")).toBe("Get started");
    expect(document.querySelector("p")?.textContent).toBe("Get started");
  });

  it("should clear the failed-locale cache on re-init so a previously failed locale can be loaded", async () => {
    vi.useFakeTimers();
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    fetchOverrides[PT_BR_URL] = { ok: false };
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    const firstInit = i18n.init({ storageKey: "test-i18n" });
    await vi.runAllTimersAsync();
    await firstInit;

    expect(i18n.locale).toBe("en-US");

    // Simulate recovery: locale file is available again, user preference is restored.
    delete fetchOverrides[PT_BR_URL];
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));

    const secondInit = i18n.init({ storageKey: "test-i18n" });
    await vi.runAllTimersAsync();
    await secondInit;

    expect(i18n.locale).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Comece agora");
  });

  it("should keep the element's fallback text when the active locale is missing a key", async () => {
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    fetchOverrides[PT_BR_URL] = {
      body: {
        "home.hero.headline": "Este é um título",
        "home.hero.description": "Lorem ipsum dolor sit amet consectetur adipisicing elit.",
        "home.hero.cta": "Comece agora",
      },
    };
    document.body.innerHTML = `<p data-i18n="home.hero.secondaryCta">Keep this text</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("pt-BR");
    // No per-key fallback: a missing key leaves the element's HTML fallback text.
    expect(document.querySelector("p")?.textContent).toBe("Keep this text");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing key "home.hero.secondaryCta" in locale "pt-BR".'),
    );
  });

  it("should restore the original fallback text when a later locale is missing a key", async () => {
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    fetchOverrides[EN_US_URL] = {
      body: {
        "home.hero.headline": "This is a headline",
        "home.hero.description": "Lorem ipsum dolor sit amet consectetur adipisicing elit.",
        "home.hero.cta": "Get started",
      },
    };
    document.body.innerHTML = `<p data-i18n="home.hero.secondaryCta">Learn more</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(document.querySelector("p")?.textContent).toBe("Saiba mais");

    expect(await i18n.setLocale("en-US")).toBe(true);
    expect(document.querySelector("p")?.textContent).toBe("Learn more");
  });

  it("should fetch only the active locale and skip the default when it loads", async () => {
    localStorage.setItem("test-i18n", JSON.stringify({ locale: "pt-BR" }));
    document.body.innerHTML = `<p data-i18n="home.hero.cta">Old greeting</p>`;

    await i18n.init({ storageKey: "test-i18n" });

    expect(i18n.locale).toBe("pt-BR");
    expect(document.querySelector("p")?.textContent).toBe("Comece agora");
    // The default locale is fetched only as a failure recovery, not eagerly.
    expect(vi.mocked(fetch).mock.calls.some(([url]) => url === EN_US_URL)).toBe(false);
  });

  it("should preserve markup and warn when data-i18n is used on a non-leaf element", async () => {
    document.body.innerHTML = `
      <button data-i18n="home.hero.cta">
        <span aria-hidden="true">*</span>
        <span>Old greeting</span>
      </button>
    `;

    await i18n.init();

    expect(document.querySelector("button")?.innerHTML).toContain("Old greeting");
    expect(document.querySelector("button span")?.textContent).toBe("*");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping key "home.hero.cta" on <button> because translated elements must be leaves.'),
    );
  });

  it("should skip translation when the bound root is inside a custom element", async () => {
    document.body.innerHTML = `
      <custom-card>
        <span data-i18n="home.hero.cta">Component greeting</span>
      </custom-card>
    `;

    const root = document.querySelector("custom-card span");

    if (root === null) {
      throw new Error("custom-card root child was not rendered");
    }

    await i18n.init({ root });

    expect(document.querySelector("custom-card span")?.textContent).toBe("Component greeting");
  });

  it("should return true immediately when setLocale is called for the already-active loaded locale", async () => {
    await i18n.init();

    const callsBefore = vi.mocked(fetch).mock.calls.length;

    expect(await i18n.setLocale("en-US")).toBe(true);
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
  });

  it("should let the latest locale request win when locale changes overlap", async () => {
    document.body.innerHTML = `<p data-i18n="home.hero.secondaryCta">Old greeting</p>`;

    await i18n.init();
    fetchOverrides[PT_BR_URL] = { delayMs: 50 };

    const firstChange = i18n.setLocale("pt-BR");
    const secondChange = i18n.setLocale("en-US");

    await expect(Promise.all([firstChange, secondChange])).resolves.toEqual([false, true]);
    expect(i18n.locale).toBe("en-US");
    expect(document.querySelector("p")?.textContent).toBe("Learn more");
  });
});
