// @vitest-environment jsdom
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { compile } from "svelte/compiler";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createErrorRegistry, isAppError, type AppError } from "./index";
import { createAppErrorBoundary } from "./svelte";

// The real Svelte runtime, with components compiled from source. Under Node.js conditions `svelte`
// resolves to its server build, where `mount` throws, so the client entry is loaded by path.
const svelteRoot = path.dirname(createRequire(import.meta.url).resolve("svelte/package.json"));
const outputDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "../.svelte-test");

interface SvelteClient {
  mount: (component: unknown, options: { target: Element; props: Record<string, unknown> }) => object;
  unmount: (instance: object) => Promise<void>;
  flushSync: () => void;
}

let svelte: SvelteClient;
let Boundary: unknown;

const compileComponent = async (name: string, source: string): Promise<unknown> => {
  const { js } = compile(source, { filename: `${name}.svelte`, generate: "client" });
  const file = path.join(outputDirectory, `${name}.js`);
  writeFileSync(file, js.code);
  return ((await import(/* @vite-ignore */ pathToFileURL(file).href)) as { default: unknown }).default;
};

beforeAll(async () => {
  mkdirSync(outputDirectory, { recursive: true });
  svelte = (await import(
    /* @vite-ignore */ pathToFileURL(path.join(svelteRoot, "src/index-client.js")).href
  )) as SvelteClient;
  await compileComponent(
    "Child",
    `<script>
      let { failure } = $props();
      const value = failure();
      if (value !== null) throw value;
    </script>
    <span>fine</span>`,
  );
  Boundary = await compileComponent(
    "Boundary",
    `<script>
      import Child from "./Child.js";
      let { boundary, failure } = $props();
    </script>
    <svelte:boundary onerror={boundary.onerror}>
      <Child {failure} />
      {#snippet failed(error, reset)}
        <p>{boundary.toAppError(error).message}</p>
        <button onclick={reset}>retry</button>
      {/snippet}
    </svelte:boundary>`,
  );
});

afterAll(() => {
  rmSync(outputDirectory, { recursive: true, force: true });
});

const mountBoundary = (props: Record<string, unknown>): { target: HTMLElement; destroy: () => Promise<void> } => {
  const target = document.createElement("div");
  document.body.append(target);
  const instance = svelte.mount(Boundary, { target, props });
  svelte.flushSync();

  return {
    target,
    destroy: async () => {
      await svelte.unmount(instance);
      target.remove();
    },
  };
};

describe("createAppErrorBoundary with a real <svelte:boundary>", () => {
  it("should render the children when nothing throws", async () => {
    const view = mountBoundary({ boundary: createAppErrorBoundary(), failure: () => null });

    expect(view.target.textContent?.trim()).toBe("fine");
    await view.destroy();
  });

  it("should show the normalized message and report the same AppError once", async () => {
    const onError = vi.fn();
    const registry = createErrorRegistry();
    registry.codes.add("project.not_found", { message: "We couldn't find that project." });
    const boundary = createAppErrorBoundary({ options: { registry }, onError });

    const view = mountBoundary({ boundary, failure: () => ({ code: "project.not_found" }) });

    expect(view.target.querySelector("p")?.textContent).toBe("We couldn't find that project.");
    expect(onError).toHaveBeenCalledTimes(1);
    const [reported] = onError.mock.calls[0] as [AppError];
    expect(isAppError(reported)).toBe(true);
    // The failed snippet asked for the same thrown value, and got the instance onError received.
    expect(boundary.toAppError(reported.originalError)).toBe(reported);
    await view.destroy();
  });

  it("should never show the raw message of an unmatched error", async () => {
    const view = mountBoundary({ boundary: createAppErrorBoundary(), failure: () => new Error("SQL detail") });

    expect(view.target.querySelector("p")?.textContent).toBe("An unexpected error occurred.");
    await view.destroy();
  });

  it("should render the children again after reset", async () => {
    let value: unknown = new Error("flaky");
    const view = mountBoundary({ boundary: createAppErrorBoundary(), failure: () => value });

    value = null;
    view.target.querySelector("button")?.click();
    svelte.flushSync();

    expect(view.target.textContent?.trim()).toBe("fine");
    await view.destroy();
  });
});

describe("createAppErrorBoundary", () => {
  it("should apply the fallback message", () => {
    const boundary = createAppErrorBoundary({ options: { fallbackMessage: "This page failed to load." } });

    expect(boundary.toAppError(new Error("x")).message).toBe("This page failed to load.");
  });

  it("should return the same AppError for the same value", () => {
    const boundary = createAppErrorBoundary();
    const thrown = new Error("x");

    expect(boundary.toAppError(thrown)).toBe(boundary.toAppError(thrown));
    expect(boundary.toAppError(new Error("y"))).not.toBe(boundary.toAppError(thrown));
  });

  it("should pass the reset function to onError", () => {
    const onError = vi.fn();
    const reset = (): void => {};

    createAppErrorBoundary({ onError }).onerror("x", reset);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: "unknown" }), reset);
  });

  it("should reject invalid options and callbacks when it is created", () => {
    expect(() => createAppErrorBoundary({ options: { maxDepth: 9 } })).toThrow(TypeError);
    expect(() => createAppErrorBoundary({ onError: "report" as never })).toThrow(TypeError);
  });
});
