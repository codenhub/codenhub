import { readFileSync } from "node:fs";

import { expect, test } from "./fixtures";

const markdown = readFileSync(new URL("../../../../packages/oidc/docs/reference/provider.md", import.meta.url), "utf8");
// The generator wraps a long declaration over several lines.
const declaration = markdown.match(/### ProviderDiagnosticReason\r?\n\r?\n```ts\r?\n([\s\S]*?)\r?\n```/)?.[1];
if (declaration === undefined) {
  throw new Error("ProviderDiagnosticReason declaration not found in the working-tree reference Markdown");
}

// The clipboard is shared beyond one page, so its tests run in order in one worker.
test.describe.configure({ mode: "default" });

for (const width of [390, 1440]) {
  test(`copies the exact provider declaration at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/oidc/reference/provider/");

    const block = page.locator(".code-block").filter({ hasText: "export type ProviderDiagnosticReason =" });
    // Do not accept clipboard contents left by another test or application.
    await page.evaluate(() => navigator.clipboard.writeText("clipboard reset"));
    await block.getByRole("button", { name: "Copy TypeScript code", exact: true }).click();
    // The Windows clipboard stores text with CRLF line endings, whatever the page wrote.
    await expect
      .poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n"))
      .toBe(declaration);
  });
}
