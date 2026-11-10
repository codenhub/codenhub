import { describe, expect, it, vi } from "vitest";

import { initializeBrowserI18n } from "../browser";
import { getI18nInternals } from "../core/internals";
import { createDeferred, createManager, dictionaries, flushMutations, setupBrowserTestHooks } from "./test-helpers";

setupBrowserTestHooks();

describe("initializeBrowserI18n document integration", () => {
  it("keeps the page's own text as the fallback for a binding started after disconnect()", async () => {
    document.body.innerHTML =
      '<p data-i18n="frOnly" data-i18n-title="frOnly" title="Original title">Original</p><p id="removed" data-i18n="greeting">Server</p>';
    const paragraph = document.querySelector("p")!;
    const removed = document.querySelector("#removed")!;
    const i18n = createManager();

    const first = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });
    expect(paragraph.textContent).toBe("Francais seulement");
    first.disconnect();

    const second = await initializeBrowserI18n({ i18n, locale: "pt-BR", root: document.body, observe: true });
    expect(paragraph.textContent).toBe("Original");
    expect(paragraph.getAttribute("title")).toBe("Original title");

    removed.removeAttribute("data-i18n");
    await flushMutations();
    expect(removed.textContent).toBe("Server");
    second.disconnect();
  });

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

  it("translates each observed element once per locale change", async () => {
    document.body.innerHTML = '<p data-i18n="greeting">First</p><p data-i18n="greeting">Second</p>';
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });
    await flushMutations();
    const translate = vi.spyOn(getI18nInternals(i18n), "lookup");

    await i18n.setLocale("pt-BR");
    await flushMutations();

    expect(translate).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toBe("OlaOla");
    binding.disconnect();
  });

  it("restores the fallback of a key removed just before a locale change", async () => {
    document.body.innerHTML = '<p data-i18n="greeting">Fallback</p>';
    const paragraph = document.querySelector("p")!;
    const i18n = createManager();
    // Registered before the binding, so the key is removed just before the binding retranslates the root.
    i18n.addEventListener("locale-change", () => paragraph.removeAttribute("data-i18n"));
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });

    await i18n.setLocale("pt-BR");
    await flushMutations();

    expect(paragraph.textContent).toBe("Fallback");
    binding.disconnect();
  });

  it("translates an element added just before a locale change once", async () => {
    const added = document.createElement("p");
    added.dataset.i18n = "greeting";
    const i18n = createManager();
    // Registered before the binding, so the element is added just before the binding retranslates the root.
    i18n.addEventListener("locale-change", () => document.body.append(added));
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });
    const translate = vi.spyOn(getI18nInternals(i18n), "lookup");

    await i18n.setLocale("pt-BR");
    await flushMutations();

    expect(translate).toHaveBeenCalledTimes(1);
    expect(added.textContent).toBe("Ola");
    binding.disconnect();
  });

  it("translates an observed addition once", async () => {
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });
    const translate = vi.spyOn(getI18nInternals(i18n), "lookup");
    const added = document.createElement("p");
    added.dataset.i18n = "greeting";

    document.body.append(added);
    await flushMutations();
    await flushMutations();

    expect(translate).toHaveBeenCalledTimes(1);
    expect(added.textContent).toBe("Bonjour");
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

  it("translates an element a custom-element root adds while the binding translates its attribute", async () => {
    class BindingWidget extends HTMLElement {
      static observedAttributes = ["title"];
      attributeChangedCallback() {
        if (this.isConnected && this.querySelector("span") === null) {
          const span = document.createElement("span");
          span.dataset.i18n = "greeting";
          span.textContent = "Span fallback";
          this.append(span);
        }
      }
    }
    customElements.define("binding-widget", BindingWidget);
    document.body.innerHTML = '<binding-widget data-i18n-title="greeting" title="Hint"></binding-widget>';
    const widget = document.querySelector("binding-widget")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "en", root: widget, observe: true });
    widget.querySelector("span")?.remove();
    await flushMutations();

    await i18n.setLocale("fr");
    await flushMutations();

    expect(widget.getAttribute("title")).toBe("Bonjour");
    expect(widget.querySelector("span")?.textContent).toBe("Bonjour");
    binding.disconnect();
  });

  it("stops handling an element that re-sets its key whenever the binding translates its attribute", async () => {
    // Without a bound, each pass would queue the next and the binding would never stop.
    const callbackLimit = 1_000;
    let callbackCount = 0;
    class EchoButton extends HTMLButtonElement {
      static observedAttributes = ["aria-label"];
      attributeChangedCallback() {
        callbackCount += 1;
        if (callbackCount > callbackLimit) {
          return;
        }
        // Normalizes the translated label and reflects its own key back unchanged.
        const label = this.getAttribute("aria-label") ?? "";
        if (label !== label.toUpperCase()) {
          this.setAttribute("aria-label", label.toUpperCase());
        }
        this.setAttribute("data-i18n-aria-label", this.getAttribute("data-i18n-aria-label") ?? "");
      }
    }
    customElements.define("echo-button", EchoButton, { extends: "button" });
    document.body.innerHTML = "<div></div>";
    const root = document.querySelector("div")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root, observe: true });
    const button = document.createElement("button", { is: "echo-button" });
    button.setAttribute("data-i18n-aria-label", "greeting");

    root.append(button);
    await flushMutations();
    await flushMutations();

    expect(callbackCount).toBeLessThan(callbackLimit);
    expect(button.getAttribute("aria-label")).toBe("BONJOUR");
    binding.disconnect();
  });

  it("translates an element missing-key handling adds while the binding translates", async () => {
    document.body.innerHTML = '<p data-i18n="missing">Fallback</p>';
    const added = document.createElement("span");
    added.dataset.i18n = "greeting";
    const i18n = createManager({
      onMissingKey: () => {
        if (!added.isConnected) {
          document.body.append(added);
        }
      },
    });
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });

    expect(added.textContent).toBe("Bonjour");
    binding.disconnect();
  });

  it("finishes the initial pass before rethrowing an error from missing-key handling", async () => {
    document.body.innerHTML =
      '<p data-i18n="greeting">Hello</p><p data-i18n="missing">Fallback</p><p data-i18n="frOnly">Other</p>';
    const failure = new Error("missing key");
    const i18n = createManager({
      onMissingKey: () => {
        throw failure;
      },
    });

    await expect(initializeBrowserI18n({ i18n, locale: "fr", root: document.body })).rejects.toBe(failure);

    expect(Array.from(document.querySelectorAll("p"), (element) => element.textContent)).toEqual([
      "Bonjour",
      "Fallback",
      "Francais seulement",
    ]);
  });

  it("finishes a locale-change pass and observed additions before reporting an error from missing-key handling", async () => {
    document.body.innerHTML =
      '<p data-i18n="greeting">Hello</p><p data-i18n="missing">Fallback</p><p data-i18n="frOnly">Other</p>';
    const failure = new Error("missing key");
    let shouldThrow = false;
    const i18n = createManager({
      onMissingKey: () => {
        if (shouldThrow) {
          throw failure;
        }
      },
    });
    const binding = await initializeBrowserI18n({ i18n, locale: "en", root: document.body, observe: true });
    const reported: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      reported.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", onError);
    shouldThrow = true;

    try {
      await i18n.setLocale("fr");
      const added = document.createElement("div");
      added.innerHTML = '<span data-i18n="missing">Added fallback</span>';
      const sibling = document.createElement("span");
      sibling.dataset.i18n = "greeting";
      document.body.append(added, sibling);
      await flushMutations();
    } finally {
      window.removeEventListener("error", onError);
      binding.disconnect();
    }

    expect(Array.from(document.querySelectorAll("p"), (element) => element.textContent)).toEqual([
      "Bonjour",
      "Fallback",
      "Francais seulement",
    ]);
    expect(document.querySelector("body > span")?.textContent).toBe("Bonjour");
    expect(reported).toEqual([failure, failure]);
  });

  it("does not translate an element added to the root and moved outside it before observation runs", async () => {
    document.body.innerHTML = '<div id="root"></div><div id="outside"></div>';
    const root = document.querySelector("#root")!;
    const outside = document.querySelector("#outside")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root, observe: true });
    const moved = document.createElement("p");
    moved.dataset.i18n = "greeting";
    moved.textContent = "Outside fallback";

    root.append(moved);
    outside.append(moved);
    await flushMutations();

    expect(moved.textContent).toBe("Outside fallback");
    binding.disconnect();
  });

  it("does not restore an element whose key was removed after it moved outside the root", async () => {
    document.body.innerHTML = '<div id="root"><p data-i18n="greeting">Fallback</p></div><div id="outside"></div>';
    const paragraph = document.querySelector("p")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.querySelector("#root")!,
      observe: true,
    });

    paragraph.removeAttribute("data-i18n");
    document.querySelector("#outside")?.append(paragraph);
    await flushMutations();

    expect(paragraph.textContent).toBe("Bonjour");
    binding.disconnect();
  });

  it("does not restore an element moved outside the root when the locale changes", async () => {
    document.body.innerHTML = '<div id="root"><p data-i18n="greeting">Fallback</p></div><div id="outside"></div>';
    const paragraph = document.querySelector("p")!;
    const i18n = createManager();
    i18n.addEventListener("locale-change", () => {
      paragraph.removeAttribute("data-i18n");
      document.querySelector("#outside")?.append(paragraph);
    });
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.querySelector("#root")!,
      observe: true,
    });

    await i18n.setLocale("pt-BR");
    await flushMutations();

    expect(paragraph.textContent).toBe("Bonjour");
    binding.disconnect();
  });

  it("translates and observes a shadow root passed as the root", async () => {
    document.body.innerHTML = "<div></div>";
    const shadowRoot = document.querySelector("div")!.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = '<p data-i18n="greeting">Fallback</p>';
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: shadowRoot, observe: true });
    const added = document.createElement("span");
    added.dataset.i18n = "greeting";

    shadowRoot.append(added);
    await flushMutations();

    expect(shadowRoot.querySelector("p")?.textContent).toBe("Bonjour");
    expect(added.textContent).toBe("Bonjour");
    binding.disconnect();
  });

  it("observes a root from another window with that window's MutationObserver", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const frameWindow = iframe.contentWindow as Window & typeof globalThis;
    const frameBody = frameWindow.document.body;
    const observe = vi.spyOn(frameWindow.MutationObserver.prototype, "observe");
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: frameBody, observe: true });
    const added = frameWindow.document.createElement("p");
    added.dataset.i18n = "greeting";

    frameBody.append(added);
    await flushMutations();

    expect(observe).toHaveBeenCalledTimes(1);
    expect(added.textContent).toBe("Bonjour");
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

  it("rejects a manager not created by createI18n", async () => {
    const i18n = { ...createManager() };

    await expect(initializeBrowserI18n({ i18n })).rejects.toThrow("must be created by createI18n()");
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
