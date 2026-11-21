import { describe, expect, it, vi } from "vitest";

import { initializeBrowserI18n } from "../browser";
import { createManager, flushMutations, setupBrowserTestHooks } from "./test-helpers";

setupBrowserTestHooks();

describe("initializeBrowserI18n attribute translation", () => {
  it.each([
    "alt",
    "title",
    "placeholder",
    "label",
    "aria-label",
    "aria-description",
    "aria-placeholder",
    "aria-roledescription",
    "aria-valuetext",
  ])("translates the %s attribute", async (attribute) => {
    const element = document.createElement("span");
    element.setAttribute(`data-i18n-${attribute}`, "greeting");
    element.setAttribute(attribute, "Fallback");
    document.body.append(element);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });

    expect(element.getAttribute(attribute)).toBe("Bonjour");
    binding.disconnect();
  });

  it("translates attributes on elements that contain markup, and text and attributes together", async () => {
    document.body.innerHTML = [
      '<button id="icon" data-i18n-aria-label="greeting" aria-label="Open"><svg></svg></button>',
      '<abbr id="both" data-i18n="greeting" data-i18n-title="greeting" title="Hint">Text</abbr>',
    ].join("");
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });

    expect(document.querySelector("#icon")?.getAttribute("aria-label")).toBe("Bonjour");
    expect(document.querySelector("#icon")?.innerHTML).toBe("<svg></svg>");
    expect(document.querySelector("#both")?.getAttribute("title")).toBe("Bonjour");
    expect(document.querySelector("#both")?.textContent).toBe("Bonjour");
    binding.disconnect();
  });

  it("restores the original value, or removes an attribute that was absent, when a later locale lacks the key", async () => {
    document.body.innerHTML = [
      '<input id="present" data-i18n-placeholder="frOnly" placeholder="Original">',
      '<input id="absent" data-i18n-placeholder="frOnly">',
    ].join("");
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, persistLocale: false });

    expect(document.querySelector("#present")?.getAttribute("placeholder")).toBe("Francais seulement");
    expect(document.querySelector("#absent")?.getAttribute("placeholder")).toBe("Francais seulement");

    await i18n.setLocale("en");

    expect(document.querySelector("#present")?.getAttribute("placeholder")).toBe("Original");
    expect(document.querySelector("#absent")?.hasAttribute("placeholder")).toBe(false);
    binding.disconnect();
  });

  it("keeps a value the application set after translation as the new fallback", async () => {
    document.body.innerHTML = '<input data-i18n-placeholder="frOnly" placeholder="Original">';
    const input = document.querySelector("input")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, persistLocale: false });

    input.setAttribute("placeholder", "Application value");
    await i18n.setLocale("en");

    expect(input.getAttribute("placeholder")).toBe("Application value");
    binding.disconnect();
  });

  it("does not translate attributes outside the allowlist", async () => {
    document.body.innerHTML =
      '<a data-i18n-href="greeting" data-i18n-onclick="greeting" data-i18n-style="greeting" href="/safe">Link</a>';
    const link = document.querySelector("a")!;
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });

    expect(link.getAttribute("href")).toBe("/safe");
    expect(link.hasAttribute("onclick")).toBe(false);
    expect(link.hasAttribute("style")).toBe(false);
    binding.disconnect();
  });

  it.each([" ", "key\nforged", "k".repeat(1_001)])(
    "skips a malformed attribute key %j and continues with other attributes",
    async (invalidKey) => {
      const element = document.createElement("input");
      element.setAttribute("data-i18n-placeholder", invalidKey);
      element.setAttribute("placeholder", "Invalid fallback");
      element.setAttribute("data-i18n-title", "greeting");
      document.body.append(element);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const i18n = createManager();

      const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });

      expect(element.getAttribute("placeholder")).toBe("Invalid fallback");
      expect(element.getAttribute("title")).toBe("Bonjour");
      expect(warn).toHaveBeenCalledWith(
        "%s",
        expect.stringMatching(
          /^\[I18n\] Skipping translation because data-i18n-placeholder contains an invalid key, "/,
        ),
        element,
      );
      binding.disconnect();
    },
  );

  it("skips attributes inside custom elements", async () => {
    document.body.innerHTML = '<app-shell><input data-i18n-placeholder="greeting" placeholder="Custom"></app-shell>';
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });

    expect(document.querySelector("app-shell input")?.getAttribute("placeholder")).toBe("Custom");
    binding.disconnect();
  });

  it("skips customized built-in elements, which own their content as dash-named ones do", async () => {
    document.body.innerHTML = [
      '<button is="x-button" data-i18n="greeting" data-i18n-title="greeting" title="Own">Own</button>',
      '<ul is="x-list"><li data-i18n="greeting">Item</li></ul>',
      '<button id="plain" data-i18n="greeting">Plain</button>',
    ].join("");
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });

    expect(document.querySelector("[is=x-button]")?.textContent).toBe("Own");
    expect(document.querySelector("[is=x-button]")?.getAttribute("title")).toBe("Own");
    expect(document.querySelector("li")?.textContent).toBe("Item");
    expect(document.querySelector("#plain")?.textContent).toBe("Bonjour");
    binding.disconnect();
  });

  it("skips customized built-in elements created from script, which have no is attribute", async () => {
    class ScriptButton extends HTMLButtonElement {}
    class ScriptList extends HTMLUListElement {}
    customElements.define("script-button", ScriptButton, { extends: "button" });
    customElements.define("script-list", ScriptList, { extends: "ul" });
    const created = document.createElement("button", { is: "script-button" });
    created.setAttribute("data-i18n", "greeting");
    created.textContent = "Own";
    const constructed = new ScriptList();
    constructed.innerHTML = '<li data-i18n="greeting">Item</li>';
    document.body.append(created, constructed);
    expect(created.hasAttribute("is")).toBe(false);

    const binding = await initializeBrowserI18n({ i18n: createManager(), locale: "fr", root: document.body });

    expect(created.textContent).toBe("Own");
    expect(constructed.querySelector("li")?.textContent).toBe("Item");
    binding.disconnect();
  });

  it("translates observed additions and attribute key changes", async () => {
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });
    const added = document.createElement("input");
    added.setAttribute("data-i18n-placeholder", "greeting");

    document.body.append(added);
    await flushMutations();

    expect(added.getAttribute("placeholder")).toBe("Bonjour");

    added.setAttribute("data-i18n-placeholder", "frOnly");
    await flushMutations();

    expect(added.getAttribute("placeholder")).toBe("Francais seulement");
    binding.disconnect();
  });

  it("restores the fallback when an observed attribute key is removed", async () => {
    document.body.innerHTML = [
      '<input id="present" data-i18n-placeholder="greeting" placeholder="Original">',
      '<input id="absent" data-i18n-title="greeting">',
    ].join("");
    const present = document.querySelector("#present")!;
    const absent = document.querySelector("#absent")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });

    present.removeAttribute("data-i18n-placeholder");
    absent.removeAttribute("data-i18n-title");
    await flushMutations();

    expect(present.getAttribute("placeholder")).toBe("Original");
    expect(absent.hasAttribute("title")).toBe(false);
    binding.disconnect();
  });

  it("restores a removed key on a descendant whose ancestor changed in the same batch", async () => {
    document.body.innerHTML =
      '<div data-i18n-title="greeting"><input data-i18n-placeholder="greeting" placeholder="Original"></div>';
    const container = document.querySelector("div")!;
    const input = document.querySelector("input")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });

    container.setAttribute("data-i18n-title", "frOnly");
    input.removeAttribute("data-i18n-placeholder");
    await flushMutations();

    expect(container.getAttribute("title")).toBe("Francais seulement");
    expect(input.getAttribute("placeholder")).toBe("Original");
    binding.disconnect();
  });

  it("keeps a value the application set when it removes the key", async () => {
    document.body.innerHTML = '<input data-i18n-placeholder="greeting" placeholder="Original">';
    const input = document.querySelector("input")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });

    input.removeAttribute("data-i18n-placeholder");
    input.setAttribute("placeholder", "Application value");
    await flushMutations();

    expect(input.getAttribute("placeholder")).toBe("Application value");
    binding.disconnect();
  });

  it("restores the text fallback when an observed text key is removed", async () => {
    document.body.innerHTML = '<p data-i18n="greeting">Original</p>';
    const paragraph = document.querySelector("p")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });

    expect(paragraph.textContent).toBe("Bonjour");
    paragraph.removeAttribute("data-i18n");
    await flushMutations();

    expect(paragraph.textContent).toBe("Original");
    binding.disconnect();
  });

  it("does not restore text over a child the application added after translation", async () => {
    document.body.innerHTML = '<p data-i18n="greeting">Original</p>';
    const paragraph = document.querySelector("p")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });

    const icon = document.createElement("span");
    paragraph.append(icon);
    paragraph.removeAttribute("data-i18n");
    await flushMutations();

    expect(paragraph.contains(icon)).toBe(true);
    expect(paragraph.textContent).toBe("Bonjour");
    binding.disconnect();
  });

  it("warns once for an invalid key on a descendant whose ancestor changed in the same batch", async () => {
    document.body.innerHTML = '<div data-i18n-title="greeting"><input data-i18n-placeholder="greeting"></div>';
    const container = document.querySelector("div")!;
    const input = document.querySelector("input")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, observe: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    container.setAttribute("data-i18n-title", "frOnly");
    input.setAttribute("data-i18n-placeholder", " ");
    await flushMutations();

    expect(warn).toHaveBeenCalledTimes(1);
    binding.disconnect();
  });
});

describe("initializeBrowserI18n messages that need values", () => {
  const createMessageManager = () =>
    createManager({
      loadLocale: (locale) =>
        locale === "en"
          ? { items: "{count, plural, one {# item} other {# items}}", hello: "Hello {name}", quoted: "Type '{name}'" }
          : {},
    });

  it("keeps the fallback and warns once per key for a message that needs values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    document.body.innerHTML = [
      '<p id="first" data-i18n="items">Your items</p>',
      '<p id="second" data-i18n="items">Your items</p>',
      '<input id="field" data-i18n-placeholder="hello" placeholder="Name">',
    ].join("");

    const binding = await initializeBrowserI18n({ i18n: createMessageManager(), locale: "en", root: document.body });

    expect(document.querySelector("#first")?.textContent).toBe("Your items");
    expect(document.querySelector("#second")?.textContent).toBe("Your items");
    expect(document.querySelector("#field")?.getAttribute("placeholder")).toBe("Name");
    const messages = warn.mock.calls.map((call) => String(call[1]));
    expect(messages.filter((message) => message.includes('needs values, "items"'))).toHaveLength(1);
    expect(messages.filter((message) => message.includes('needs values, "hello"'))).toHaveLength(1);
    binding.disconnect();
  });

  it("shows a message whose braces are quoted, which needs no values", async () => {
    document.body.innerHTML = '<p data-i18n="quoted">Fallback</p>';

    const binding = await initializeBrowserI18n({ i18n: createMessageManager(), locale: "en", root: document.body });

    expect(document.querySelector("p")?.textContent).toBe("Type {name}");
    binding.disconnect();
  });
});

describe("initializeBrowserI18n fallback language", () => {
  it("marks text from a fallback locale with its lang, and removes it once the text is in the page's locale", async () => {
    document.body.innerHTML =
      '<p id="fallback" data-i18n="fallbackOnly">Text</p><p id="own" data-i18n="greeting">Text</p>';
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, persistLocale: false });

    expect(document.querySelector("#fallback")?.getAttribute("lang")).toBe("en");
    expect(document.querySelector("#own")?.hasAttribute("lang")).toBe(false);

    await i18n.setLocale("en");

    expect(document.querySelector("#fallback")?.hasAttribute("lang")).toBe(false);
    binding.disconnect();
  });

  it("restores the element's own lang, and keeps one the application set since", async () => {
    document.body.innerHTML = [
      '<p id="own" lang="fr" data-i18n="greeting">Texte</p>',
      '<p id="changed" data-i18n="fallbackOnly">Text</p>',
    ].join("");
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "en", root: document.body, persistLocale: false });
    expect(document.querySelector("#own")?.getAttribute("lang")).toBe("en");
    await i18n.setLocale("fr");
    expect(document.querySelector("#own")?.getAttribute("lang")).toBe("fr");
    expect(document.querySelector("#changed")?.getAttribute("lang")).toBe("en");
    document.querySelector("#changed")?.setAttribute("lang", "de");

    await i18n.setLocale("en");

    expect(document.querySelector("#own")?.getAttribute("lang")).toBe("en");
    expect(document.querySelector("#changed")?.getAttribute("lang")).toBe("de");
    binding.disconnect();
  });

  it("marks an element without children by its attributes, and not an element whose children it would mislabel", async () => {
    document.body.innerHTML = [
      '<img id="image" data-i18n-alt="fallbackOnly" alt="Image">',
      '<div id="box" data-i18n-title="fallbackOnly"><span>Texte</span></div>',
      '<abbr id="mixed" data-i18n="greeting" data-i18n-title="fallbackOnly">Text</abbr>',
    ].join("");
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, persistLocale: false });

    expect(document.querySelector("#image")?.getAttribute("lang")).toBe("en");
    expect(document.querySelector("#box")?.hasAttribute("lang")).toBe(false);
    expect(document.querySelector("#mixed")?.hasAttribute("lang")).toBe(false);
    binding.disconnect();
  });

  it("does not mark an element showing its own text after a miss", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    document.body.innerHTML = '<p data-i18n="nowhere">Text</p>';

    const binding = await initializeBrowserI18n({ i18n: createManager(), locale: "fr", root: document.body });

    expect(document.querySelector("p")?.hasAttribute("lang")).toBe(false);
    binding.disconnect();
  });

  it("does not mark an element by its attributes when its text key throws", async () => {
    document.body.innerHTML = '<abbr data-i18n="missing" data-i18n-title="fallbackOnly">Text</abbr>';
    const i18n = createManager({
      onMissingKey: () => {
        throw new Error("missing key");
      },
    });

    await expect(initializeBrowserI18n({ i18n, locale: "fr", root: document.body })).rejects.toThrow("missing key");

    expect(document.querySelector("abbr")?.textContent).toBe("Text");
    expect(document.querySelector("abbr")?.hasAttribute("lang")).toBe(false);
  });

  it("leaves a lang the application set over a marked element", async () => {
    document.body.innerHTML = '<p data-i18n="fallbackOnly">Text</p>';
    const paragraph = document.querySelector("p")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body, persistLocale: false });
    paragraph.setAttribute("lang", "de");

    await i18n.setLocale("ar");
    expect(paragraph.getAttribute("lang")).toBe("de");
    await i18n.setLocale("en");
    expect(paragraph.getAttribute("lang")).toBe("de");
    await i18n.setLocale("fr");
    expect(paragraph.getAttribute("lang")).toBe("de");
    binding.disconnect();
  });

  it("marks an element whose missed attribute shows nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    document.body.innerHTML = '<button data-i18n="fallbackOnly" data-i18n-title="nowhere">Button</button>';

    const binding = await initializeBrowserI18n({ i18n: createManager(), locale: "fr", root: document.body });

    expect(document.querySelector("button")?.hasAttribute("title")).toBe(false);
    expect(document.querySelector("button")?.getAttribute("lang")).toBe("en");
    binding.disconnect();
  });

  it("marks text by the language it inherits rather than by the active locale", async () => {
    document.documentElement.lang = "en";
    document.body.innerHTML = [
      '<div id="widget">',
      '<p id="active" data-i18n="greeting">Text</p>',
      '<p id="inherited" data-i18n="fallbackOnly">Text</p>',
      '<div lang="FR"><p id="upper" data-i18n="greeting">Text</p></div>',
      "</div>",
    ].join("");
    const i18n = createManager();

    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.querySelector("#widget")!,
      syncDocument: false,
      persistLocale: false,
    });

    expect(document.querySelector("#active")?.getAttribute("lang")).toBe("fr");
    expect(document.querySelector("#inherited")?.hasAttribute("lang")).toBe(false);
    expect(document.querySelector("#upper")?.hasAttribute("lang")).toBe(false);
    await i18n.setLocale("en");
    expect(document.querySelector("#active")?.hasAttribute("lang")).toBe(false);
    expect(document.querySelector("#upper")?.getAttribute("lang")).toBe("en");
    binding.disconnect();
  });

  it("marks text by the active locale when no ancestor declares a language", async () => {
    document.documentElement.removeAttribute("lang");
    document.body.innerHTML =
      '<p id="fallback" data-i18n="fallbackOnly">Text</p><p id="own" data-i18n="greeting">Text</p>';

    const binding = await initializeBrowserI18n({
      i18n: createManager(),
      locale: "fr",
      root: document.body,
      syncDocument: false,
      persistLocale: false,
    });

    expect(document.querySelector("#fallback")?.getAttribute("lang")).toBe("en");
    expect(document.querySelector("#own")?.hasAttribute("lang")).toBe(false);
    binding.disconnect();
  });

  it("marks text in a shadow root by the language its host inherits", async () => {
    document.documentElement.lang = "en";
    document.body.innerHTML = "<div></div>";
    const shadowRoot = document.querySelector("div")!.attachShadow({ mode: "open" });
    shadowRoot.innerHTML =
      '<p id="active" data-i18n="greeting">Text</p><p id="inherited" data-i18n="fallbackOnly">Text</p>';

    const binding = await initializeBrowserI18n({
      i18n: createManager(),
      locale: "fr",
      root: shadowRoot,
      syncDocument: false,
      persistLocale: false,
    });

    expect(shadowRoot.querySelector("#active")?.getAttribute("lang")).toBe("fr");
    expect(shadowRoot.querySelector("#inherited")?.hasAttribute("lang")).toBe(false);
    binding.disconnect();
  });

  it("marks a clone of a marked element by the text it shows rather than the lang it copied", async () => {
    document.body.innerHTML = '<ul><li data-i18n="fallbackOnly">Text</li></ul>';
    const item = document.querySelector("li")!;
    const i18n = createManager();
    const binding = await initializeBrowserI18n({
      i18n,
      locale: "fr",
      root: document.body,
      observe: true,
      persistLocale: false,
    });
    expect(item.getAttribute("lang")).toBe("en");

    const clone = item.cloneNode(true) as Element;
    clone.setAttribute("data-i18n", "greeting");
    item.after(clone);
    await flushMutations();

    expect(clone.textContent).toBe("Bonjour");
    expect(clone.getAttribute("lang")).toBe("fr");
    // The copied lang is the clone's own, and labels its English fallback text once the key is gone.
    clone.removeAttribute("data-i18n");
    await flushMutations();
    expect(clone.textContent).toBe("English fallback");
    expect(clone.getAttribute("lang")).toBe("en");
    binding.disconnect();
  });

  it("restores the element's lang when an observed key is removed", async () => {
    document.body.innerHTML = '<p data-i18n="fallbackOnly">Text</p>';
    const paragraph = document.querySelector("p")!;
    const binding = await initializeBrowserI18n({
      i18n: createManager(),
      locale: "fr",
      root: document.body,
      observe: true,
    });
    expect(paragraph.getAttribute("lang")).toBe("en");

    paragraph.removeAttribute("data-i18n");
    await flushMutations();

    expect(paragraph.hasAttribute("lang")).toBe(false);
    expect(paragraph.textContent).toBe("Text");
    binding.disconnect();
  });
});

describe("initializeBrowserI18n style sheet titles", () => {
  it.each([
    ["style", null],
    ["link", "stylesheet"],
    ["link", "Alternate StyleSheet"],
  ])("does not translate the title of <%s rel=%s>, which names a style sheet set", async (name, rel) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const element = document.createElement(name);
    if (rel !== null) {
      element.setAttribute("rel", rel);
    }
    element.setAttribute("title", "Default");
    element.setAttribute("data-i18n-title", "greeting");
    document.head.append(element);

    const binding = await initializeBrowserI18n({
      i18n: createManager(),
      locale: "fr",
      root: document.documentElement,
    });

    expect(element.getAttribute("title")).toBe("Default");
    expect(String(warn.mock.calls[0]?.[1])).toContain("names a style sheet set");
    binding.disconnect();
    element.remove();
  });

  it("translates the title of a link that is not a style sheet, such as a feed", async () => {
    const element = document.createElement("link");
    element.setAttribute("rel", "alternate");
    element.setAttribute("title", "Feed");
    element.setAttribute("data-i18n-title", "greeting");
    document.head.append(element);

    const binding = await initializeBrowserI18n({
      i18n: createManager(),
      locale: "fr",
      root: document.documentElement,
    });

    expect(element.getAttribute("title")).toBe("Bonjour");
    binding.disconnect();
    element.remove();
  });
});
