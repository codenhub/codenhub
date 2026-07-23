import { describe, expect, it } from "vitest";

import { viteIconsPlugin } from "./vite.js";

describe("vite plugin entrypoint", () => {
  it("should create viteIconsPlugin and handle virtual module", () => {
    const plugin = viteIconsPlugin();

    const transformHook = plugin.transform;
    const transformFn =
      typeof transformHook === "function" ? transformHook : (transformHook as { handler: Function })?.handler;
    transformFn?.call(plugin, '<div class="ic-close"></div>', "app.tsx");

    const resolveIdHook = plugin.resolveId;
    const resolveIdFn =
      typeof resolveIdHook === "function" ? resolveIdHook : (resolveIdHook as { handler: Function })?.handler;
    const virtualId = resolveIdFn?.call(plugin, "virtual:codenhub-icons.css");
    expect(virtualId).toBe("\0virtual:codenhub-icons.css");

    const loadHook = plugin.load;
    const loadFn = typeof loadHook === "function" ? loadHook : (loadHook as { handler: Function })?.handler;
    const css = loadFn?.call(plugin, "\0virtual:codenhub-icons.css");
    expect(css).toContain(".ic,");
    expect(css).toContain(".ic-close {");
  });
});
