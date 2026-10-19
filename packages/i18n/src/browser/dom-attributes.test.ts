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
        "[I18n] Skipping translation because data-i18n-placeholder contains an invalid key.",
      );
      binding.disconnect();
    },
  );

  it("skips attributes on active containers and inside custom elements", async () => {
    document.body.innerHTML = [
      '<template data-i18n-title="greeting" title="Template"></template>',
      '<app-shell><input data-i18n-placeholder="greeting" placeholder="Custom"></app-shell>',
    ].join("");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const i18n = createManager();

    const binding = await initializeBrowserI18n({ i18n, locale: "fr", root: document.body });

    expect(document.querySelector("template")?.getAttribute("title")).toBe("Template");
    expect(document.querySelector("app-shell input")?.getAttribute("placeholder")).toBe("Custom");
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
});
