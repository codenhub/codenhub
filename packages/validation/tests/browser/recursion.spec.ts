import { expect, test } from "@playwright/test";

/*
 * Each level of a recursive schema is levels of the JavaScript stack, and how many a stack holds is the
 * engine's own: a worker has about half of a page's in Chromium and Firefox. So the default `maxDepth`
 * of `lazy` is held to every engine here, on a page and in a worker: valid input as deep as it allows
 * passes, and deeper input fails with `too_big`, and neither throws. The schema is run on its first
 * call, when a level costs the most stack. A change that adds frames to a level fails this before it
 * overflows a stack for a consumer.
 */

/** The deepest nesting the default `maxDepth` of 128 lets through, the root being a level too. */
const DEEPEST = 127;

/**
 * Validates a tree nested `depth` levels with a recursive `union` of objects, as a document or a syntax
 * tree is, and gives `"ok"`, `"too deep"` when the limit of depth stopped it, or what was thrown. It is run as
 * source, on the page and in a worker, so it uses nothing from the scope around it.
 */
const PROBE = `(v, depth) => {
  const { array, lazy, literal, object, optional, record, string, union } = v;
  const node = lazy(() =>
    union([
      object({ type: literal("text"), value: string() }),
      object({
        type: literal("element"),
        tag: string({ min: 1 }),
        attributes: optional(record(string(), string())),
        children: array(node, { max: 100 }),
      }),
    ]),
  );
  let tree = { type: "text", value: "a" };
  for (let level = 0; level < depth; level += 1) {
    tree = { type: "element", tag: "p", children: [tree] };
  }
  try {
    const result = node(tree);
    if (result.ok) {
      return "ok";
    }
    // Under a union the limit is held in the issue of the union, so it is looked for in the whole failure.
    return JSON.stringify(result.error.issues).includes('"type":"depth"') ? "too deep" : "failed otherwise";
  } catch (error) {
    return "threw " + String(error);
  }
}`;

/** The probe run on the page, as an expression the page evaluates. */
const onPage = (depth: number): string => `(${PROBE})(globalThis.validation, ${depth})`;

/**
 * The probe run in a module worker that imports the built package itself, as an expression the page
 * evaluates. It is text, as the probe is, since this file is checked without the types of a browser.
 */
const inWorker = (depth: number): string => `new Promise((resolve) => {
  const code = 'import * as v from "' + location.origin + '/dist/index.js"; postMessage((' + ${JSON.stringify(PROBE)} + ')(v, ${depth}));';
  const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })), { type: "module" });
  const finish = (answer) => {
    worker.terminate();
    resolve(String(answer));
  };
  worker.onmessage = (event) => finish(event.data);
  worker.onerror = (event) => finish("worker error " + event.message);
})`;

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
});

for (const [depth, expected] of [
  [DEEPEST, "ok"],
  [DEEPEST + 1, "too deep"],
  [5000, "too deep"],
] as const) {
  test(`a tree ${depth} levels deep gives "${expected}" on a page`, async ({ page }) => {
    expect(await page.evaluate(onPage(depth))).toBe(expected);
  });

  test(`a tree ${depth} levels deep gives "${expected}" in a worker`, async ({ page }) => {
    expect(await page.evaluate(inWorker(depth))).toBe(expected);
  });
}
