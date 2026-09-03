import { describe, expect, it, vi } from "vitest";

import { initializeBrowserI18n } from "../browser";
import { createDeferred, createManager, dictionaries, flushMutations, setupBrowserTestHooks } from "./test-helpers";

setupBrowserTestHooks();

describe("initializeBrowserI18n document integration", () => {
  it("synchronizes the document locale and direction by default", async () => {
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, locale: "ar" });

    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("does not synchronize document attributes when disabled", async () => {
    document.documentElement.lang = "server-locale";
    document.documentElement.dir = "auto";
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, locale: "fr", syncDocument: false });

    expect(document.documentElement.lang).toBe("server-locale");
    expect(document.documentElement.dir).toBe("auto");
  });

  it("leaves DOM translation disabled when no root is provided", async () => {
    document.body.innerHTML = '<p data-i18n="greeting">Server fallback</p>';
    const i18n = createManager();

    await initializeBrowserI18n({ i18n, locale: "fr" });

    expect(document.querySelector("p")?.textContent).toBe("Server fallback");
  });

  it("translates the root and eligible descendant leaves while preserving unsafe markup", async () => {
    document.body.innerHTML = [
      '<main data-i18n="greeting">Root fallback</main>',
      '<p data-i18n="greeting">Leaf fallback</p>',
      '<p id="markup" data-i18n="greeting">Keep <strong>markup</strong></p>',
      '<app-shell><span data-i18n="greeting">Custom fallback</span></app-shell>',
    ].join("");
    const root = document.querySelector("main")!;
    const i18n = createManager();

    const bodyBinding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });
    bodyBinding.disconnect();
    const rootBinding = await initializeBrowserI18n({ i18n, locale: "fr", root });

    expect(root.textContent).toBe("Bonjour");
    expect(document.querySelector("p")?.textContent).toBe("Bonjour");
    expect(document.querySelector("#markup")?.innerHTML).toBe("Keep <strong>markup</strong>");
    expect(document.querySelector("app-shell span")?.textContent).toBe("Custom fallback");
    rootBinding.disconnect();
  });

  it("does not include rejected DOM translation keys in diagnostics", async () => {
    document.body.innerHTML = '<p data-i18n="key&#10;forged">Keep <strong>markup</strong></p>';
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, root: document.body });
    binding.disconnect();

    expect(warn).toHaveBeenCalledWith("[I18n] Skipping translation on <p> because translated elements must be leaves.");
    for (const [message] of warn.mock.calls) {
      expect(String(message)).not.toContain("key\nforged");
      expect(String(message)).not.toContain("\n");
    }
  });

  it.each(["style", "script", "noscript", "template"])("does not translate active <%s> containers", async (tagName) => {
    const element = document.createElement(tagName);
    if (element instanceof HTMLScriptElement) {
      element.type = "application/json";
    }
    element.setAttribute("data-i18n", "greeting");
    const fallbackText = tagName === "style" ? "" : "Safe fallback";
    element.textContent = fallbackText;
    document.body.append(element);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });
    try {
      expect(element.textContent).toBe(fallbackText);
      expect(warn).toHaveBeenCalledWith(
        `[I18n] Skipping translation on <${tagName}> because the element can activate or hide translated content.`,
      );
    } finally {
      binding.disconnect();
    }
  });

  it("does not translate SVG style elements", async () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "style");
    element.setAttribute("data-i18n", "greeting");
    document.body.append(element);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });
    try {
      expect(element.textContent).toBe("");
      expect(warn).toHaveBeenCalledWith(
        "[I18n] Skipping translation on <style> because the element can activate or hide translated content.",
      );
    } finally {
      binding.disconnect();
    }
  });

  it.each([" ", "key\nforged", "k".repeat(1_001)])(
    "skips malformed keys during initial translation and continues with other elements",
    async (invalidKey) => {
      const invalid = document.createElement("p");
      invalid.dataset.i18n = invalidKey;
      invalid.textContent = "Invalid fallback";
      const valid = document.createElement("p");
      valid.dataset.i18n = "greeting";
      valid.textContent = "Valid fallback";
      document.body.append(invalid, valid);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const i18n = createManager();

      const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });

      expect(invalid.textContent).toBe("Invalid fallback");
      expect(valid.textContent).toBe("Bonjour");
      expect(warn).toHaveBeenCalledWith("[I18n] Skipping translation because data-i18n contains an invalid key.");
      binding.disconnect();
    },
  );

  it("restores the original fallback when a later locale lacks the key", async () => {
    document.body.innerHTML = '<p data-i18n="frOnly">Original fallback</p>';
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });
    expect(document.querySelector("p")?.textContent).toBe("Francais seulement");

    await i18n.setLocale("ar");

    expect(document.querySelector("p")?.textContent).toBe("Original fallback");
    binding.disconnect();
  });

  it("observes added leaves and translation attribute changes", async () => {
    const i18n = createManager();
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.body,
      observe: true,
    });
    const added = document.createElement("p");
    added.dataset.i18n = "greeting";
    added.textContent = "Added fallback";
    document.body.append(added);
    await flushMutations();
    expect(added.textContent).toBe("Bonjour");

    added.dataset.i18n = "missing";
    await flushMutations();

    expect(added.textContent).toBe("Added fallback");
    binding.disconnect();
  });

  it("skips malformed observed keys and continues with other added elements", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager();
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.body,
      observe: true,
    });
    const section = document.createElement("section");
    section.innerHTML = [
      '<p data-i18n="key&#10;forged">Invalid fallback</p>',
      '<p data-i18n="greeting">Valid fallback</p>',
    ].join("");

    document.body.append(section);
    await flushMutations();
    try {
      expect(section.children[0]?.textContent).toBe("Invalid fallback");
      expect(section.children[1]?.textContent).toBe("Bonjour");
      expect(warn).toHaveBeenCalledWith("[I18n] Skipping translation because data-i18n contains an invalid key.");
    } finally {
      binding.disconnect();
    }
  });

  it("translates added subtrees without rescanning the observed root", async () => {
    const i18n = createManager();
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.body,
      observe: true,
    });
    const queryRoot = vi.spyOn(document.body, "querySelectorAll");
    const section = document.createElement("section");
    section.innerHTML = '<p data-i18n="greeting">Added fallback</p>';

    document.body.append(section);
    await flushMutations();

    expect(section.querySelector("p")?.textContent).toBe("Bonjour");
    expect(queryRoot).not.toHaveBeenCalled();
    binding.disconnect();
  });

  it("scans nested changed subtrees only once per mutation batch", async () => {
    const i18n = createManager();
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.body,
      observe: true,
    });
    const section = document.createElement("section");
    const nested = document.createElement("div");
    nested.innerHTML = '<p data-i18n="greeting">Added fallback</p>';
    const nestedQuery = vi.spyOn(nested, "querySelectorAll");

    document.body.append(section);
    section.append(nested);
    await flushMutations();

    binding.disconnect();
    expect(nested.querySelector("p")?.textContent).toBe("Bonjour");
    expect(nestedQuery).not.toHaveBeenCalled();
  });

  it("does not translate content added inside a custom element", async () => {
    document.body.innerHTML = "<app-shell></app-shell>";
    const i18n = createManager();
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.body,
      observe: true,
    });
    const added = document.createElement("span");
    added.dataset.i18n = "greeting";
    added.textContent = "Custom fallback";

    document.querySelector("app-shell")?.append(added);
    await flushMutations();

    expect(added.textContent).toBe("Custom fallback");
    binding.disconnect();
  });

  it("retranslates, persists, and synchronizes after locale changes", async () => {
    document.body.innerHTML = '<p data-i18n="greeting">Fallback</p>';
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "en", root: document.body });

    await i18n.setLocale("ar");

    expect(document.querySelector("p")?.textContent).toBe("Marhaba");
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "ar" }));
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    binding.disconnect();
  });

  it("disconnects browser effects without resetting core or reverting the DOM", async () => {
    document.body.innerHTML = '<p data-i18n="greeting">Fallback</p>';
    const i18n = createManager();
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.body,
      observe: true,
    });
    binding.disconnect();
    const added = document.createElement("p");
    added.dataset.i18n = "greeting";
    added.textContent = "Added fallback";
    document.body.append(added);

    await i18n.setLocale("ar");
    await flushMutations();

    expect(i18n.isReady).toBe(true);
    expect(i18n.locale).toBe("ar");
    expect(document.querySelector("p")?.textContent).toBe("Bonjour");
    expect(added.textContent).toBe("Added fallback");
    expect(document.documentElement.lang).toBe("fr");
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "fr" }));
  });
});

describe("initializeBrowserI18n binding lifecycle", () => {
  it("rejects a duplicate binding while initialization is in progress", async () => {
    const localeLoad = createDeferred<unknown>();
    const i18n = createManager({ loadLocale: () => localeLoad.promise });

    const initialization = initializeBrowserI18n({ i18n, locale: "en" });
    const duplicateInitialization = initializeBrowserI18n({ i18n, locale: "fr" });
    localeLoad.resolve(dictionaries.en);

    await expect(duplicateInitialization).rejects.toBeInstanceOf(TypeError);
    const binding = await initialization;
    binding.disconnect();
  });

  it("rejects and releases ownership when core initialization supersedes it before readiness", async () => {
    const localeLoads = {
      en: createDeferred<unknown>(),
      fr: createDeferred<unknown>(),
    };
    const i18n = createManager({
      loadLocale: (locale) => (locale === "fr" ? localeLoads.fr.promise : localeLoads.en.promise),
    });

    const browserInitialization = initializeBrowserI18n({ i18n, locale: "en" });
    const coreInitialization = i18n.init({ locale: "fr" });
    localeLoads.en.resolve(dictionaries.en);

    await expect(browserInitialization).rejects.toThrow("Browser initialization was superseded");
    expect(i18n.isReady).toBe(false);

    localeLoads.fr.resolve(dictionaries.fr);
    await coreInitialization;
    const binding = await initializeBrowserI18n({ i18n, locale: "fr" });
    binding.disconnect();
  });

  it("rejects when superseded while the manager is already ready with the selected locale", async () => {
    const i18n = createManager();
    await i18n.init({ locale: "en" });

    const browserInitialization = initializeBrowserI18n({ i18n, locale: "en" });
    await i18n.setLocale("en");

    await expect(browserInitialization).rejects.toThrow("Browser initialization was superseded");
    const binding = await initializeBrowserI18n({ i18n, locale: "en" });
    binding.disconnect();
  });

  it("rejects a duplicate binding while another binding is active", async () => {
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n });

    await expect(initializeBrowserI18n({ i18n })).rejects.toBeInstanceOf(TypeError);

    binding.disconnect();
  });

  it("allows a new binding after the active binding disconnects", async () => {
    const i18n = createManager();
    const firstBinding = await initializeBrowserI18n({ i18n, locale: "en" });
    firstBinding.disconnect();

    const secondBinding = await initializeBrowserI18n({ i18n, locale: "fr" });

    expect(i18n.locale).toBe("fr");
    secondBinding.disconnect();
  });

  it("synchronizes once initially and again after a successful core reinitialization", async () => {
    document.body.innerHTML = '<p data-i18n="greeting">Fallback</p>';
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "en", root: document.body });

    expect(setItem).toHaveBeenCalledTimes(1);
    await i18n.init({ locale: "ar" });

    expect(setItem).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("i18n")).toBe(JSON.stringify({ locale: "ar" }));
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.querySelector("p")?.textContent).toBe("Marhaba");
    binding.disconnect();
  });

  it("releases ownership and browser hooks when observer setup fails", async () => {
    const failure = new Error("observer unavailable");
    const observe = vi.spyOn(MutationObserver.prototype, "observe").mockImplementation(() => {
      throw failure;
    });
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const i18n = createManager();

    await expect(initializeBrowserI18n({ i18n, locale: "en", root: document.body, observe: true })).rejects.toBe(
      failure,
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
    observe.mockRestore();

    await i18n.setLocale("fr");
    expect(document.documentElement.lang).toBe("");
    expect(localStorage.getItem("i18n")).toBeNull();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr" });
    expect(document.documentElement.lang).toBe("fr");
    binding.disconnect();
  });
});
