import { test as base, expect, type BrowserContext } from "@playwright/test";

import { scenarios } from "../scenarios";

/*
 * Each scenario runs in the page against the built package, on the engine's own Web Crypto. A failure
 * reports the error the engine threw, so an algorithm an engine lacks is named rather than skipped.
 *
 * No test reads anything an earlier one left in the context, so the context is shared per worker and
 * each test takes a fresh page, as docs/specs/tests.md recommends.
 */
const test = base.extend<Record<string, unknown>, { sharedContext: BrowserContext }>({
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    await use(page);
    await page.close();
  },
  sharedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
});

interface ScenarioWindow {
  scenarioNames: string[];
  runScenario: (name: string) => Promise<string>;
}

test("the page offers every scenario", async ({ page }) => {
  await page.goto("/tests/browser/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  expect(await page.evaluate(() => (globalThis as unknown as ScenarioWindow).scenarioNames)).toEqual(
    Object.keys(scenarios),
  );
});

/**
 * What a scenario gives on an engine that lacks what it needs. Playwright's WebKit build for Windows
 * (WebKit 26.5 with Playwright 1.61, on Windows 11) has no Ed25519 in Web Crypto: generating or importing
 * such a key throws. The answer is asserted rather than skipped, so the test fails once the build gains
 * Ed25519 and this entry can go. Safari on macOS and the Linux build CI runs are expected to pass.
 */
function expectedOutcome(name: string, browserName: string): string {
  if (browserName === "webkit" && process.platform === "win32" && /^(EdDSA|Ed25519) /.test(name)) {
    return "NotSupportedError: The operation is not supported.";
  }
  return "ok";
}

for (const name of Object.keys(scenarios)) {
  test(name, async ({ page, browserName }) => {
    await page.goto("/tests/browser/");
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
    expect(
      await page.evaluate((scenario) => (globalThis as unknown as ScenarioWindow).runScenario(scenario), name),
    ).toBe(expectedOutcome(name, browserName));
  });
}
