import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

// The built package is served from disk under an origin that exists only inside the test, so the
// suite needs no dev server and exercises the files that are published.
const ORIGIN = "http://error.test";
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");

test.beforeEach(async ({ page }) => {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname === "/") {
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>error</title>" });
      return;
    }

    if (pathname.startsWith("/unreachable")) {
      await route.abort("connectionrefused");
      return;
    }

    try {
      const body = await readFile(path.join(DIST, pathname));
      await route.fulfill({ contentType: "text/javascript", body });
    } catch {
      await route.fulfill({ status: 404, body: "" });
    }
  });
  await page.goto(`${ORIGIN}/`);
});

test("an AppError keeps its classification and accepts new properties", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createAppError, createErrorRegistry, isAppError } = await import("/index.js");
    const registry = createErrorRegistry();
    registry.codes.add("23505", { message: "Already exists.", source: "app.db" });
    const error = createAppError({ code: "23505" }, { registry }) as Error & Record<string, unknown>;

    const rejectedWrites: string[] = [];
    for (const field of ["message", "name", "type", "code", "messageKey", "source", "isRetryable", "originalError"]) {
      // The page function is not strict code, where a rejected assignment would be silent.
      if (!Reflect.set(error, field, "changed") && !Reflect.deleteProperty(error, field)) {
        rejectedWrites.push(field);
      }
    }

    // What Koa's error handler does to every error it catches.
    error.status = 500;

    return {
      isAppError: isAppError(error),
      isError: error instanceof Error,
      rejectedWrites,
      status: error.status,
      hasStack: typeof error.stack === "string",
      json: JSON.parse(JSON.stringify(error)) as unknown,
    };
  });

  expect(result.isAppError).toBe(true);
  expect(result.isError).toBe(true);
  expect(result.rejectedWrites).toEqual([
    "message",
    "name",
    "type",
    "code",
    "messageKey",
    "source",
    "isRetryable",
    "originalError",
  ]);
  expect(result.status).toBe(500);
  expect(result.hasStack).toBe(true);
  expect(result.json).toEqual({
    name: "AppError",
    message: "Already exists.",
    type: "known",
    code: "23505",
    messageKey: null,
    source: "app.db",
    isRetryable: false,
  });
});

test("the browser preset classifies the errors this engine raises", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { attemptAsync } = await import("/index.js");
    const { browserErrorRegistry: registry } = await import("/registries/browser.js");

    const aborted = new AbortController();
    aborted.abort();

    const outcomes = {
      failedFetch: await attemptAsync(() => fetch("/unreachable"), { registry }),
      abortedFetch: await attemptAsync(() => fetch("/unreachable", { signal: aborted.signal }), { registry }),
      timedOutFetch: await attemptAsync(() => fetch("/unreachable", { signal: AbortSignal.timeout(0) }), { registry }),
      failedImport: await attemptAsync(() => import("/missing-chunk.js"), { registry }),
    };

    return Object.fromEntries(
      Object.entries(outcomes).map(([name, outcome]) => [
        name,
        outcome.ok ? null : { ...outcome.error.toJSON(), raw: String(outcome.error.originalError) },
      ]),
    );
  });

  expect(result.failedFetch).toMatchObject({ type: "unexpected", messageKey: "error.browser.requestFailed" });
  expect(result.abortedFetch).toMatchObject({ type: "known", code: "AbortError" });
  expect(result.failedImport).not.toBeNull();
  // Not asserted further: the timeout races the refusal, and only Chromium words a failed import
  // the way the preset matches.
});

test("appErrorFromJSON rebuilds a serialized AppError", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { appErrorFromJSON, createAppError, isAppError } = await import("/index.js");
    const { browserErrorRegistry: registry } = await import("/registries/browser.js");
    const original = createAppError(new DOMException("Aborted", "AbortError"), { registry });
    const rebuilt = appErrorFromJSON(JSON.parse(JSON.stringify(original)));

    return { isAppError: isAppError(rebuilt), same: JSON.stringify(rebuilt) === JSON.stringify(original) };
  });

  expect(result).toEqual({ isAppError: true, same: true });
});
