import { expect, test } from "./fixtures";

for (const width of [390, 1440]) {
  test(`soft-wraps the provider diagnostic signature at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/oidc/reference/provider/");

    const block = page.locator(".code-block").filter({ hasText: "export type ProviderDiagnosticReason =" });
    const pre = block.locator("pre");
    await expect(pre).toBeVisible();
    await expect
      .poll(() => pre.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(0);
    // A page widened to fit the declaration would also make scrollWidth === clientWidth.
    const box = (await pre.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  });
}

test("keeps an ordinary guide example horizontally scrollable on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/styles/usage/customizing/");

  const pre = page.locator("pre").filter({ hasText: "background: color-mix(in oklab" });
  await expect(pre).toBeVisible();
  await expect(pre).toHaveCSS("white-space", "pre");
  const dimensions = await pre.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, scrollLeft: element.scrollLeft };
  });
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  expect(dimensions.scrollLeft).toBeGreaterThan(0);
});

for (const document of [
  { path: "/oidc/reference/provider/", heading: "ProviderDiagnosticReason", fragment: "providerdiagnosticreason" },
  { path: "/styles/usage/customizing/", heading: "Material tokens", fragment: "material-tokens" },
]) {
  test(`opens the phone outline and closes it after navigating on ${document.path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(document.path);

    const toggle = page.getByRole("button", { name: "On this page", exact: true });
    const outline = page.locator("#page-outline-links");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(outline).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(outline).toBeVisible();
    await outline.getByRole("link", { name: document.heading, exact: true }).click();

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(outline).toBeHidden();
    await expect(page).toHaveURL(`${document.path}#${document.fragment}`);
    // The heading's accessible name includes its permalink label, so find it by its fragment.
    const heading = page.locator(`#${document.fragment}`);
    await expect(heading).toHaveRole("heading");
    await expect(heading).toHaveText(document.heading);
    await expect(heading).toBeInViewport();
  });
}

test("wraps long identifiers inside the desktop outline rail", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/error/reference/");

  const rail = page.locator(".toc-rail nav");
  await expect(rail.getByRole("link", { name: "DEFAULT_APP_ERROR_MESSAGE", exact: true })).toBeVisible();
  expect(await rail.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
});

for (const width of [390, 1280]) {
  test(`breaks a reference title only after a slash at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/error/reference/registries/browser/");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("@codenhub/error/registries/browser");
    // Characters that start a new line, each preceded by the character before it.
    const breaks = await heading.evaluate((element) => {
      const found: string[] = [];
      let previousTop: number | undefined;
      let previous = "";
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        for (let index = 0; index < (node.textContent ?? "").length; index += 1) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const top = range.getBoundingClientRect().top;
          if (previousTop !== undefined && top > previousTop + 1) {
            found.push(previous);
          }
          previousTop = top;
          previous = node.textContent![index]!;
        }
      }
      return found;
    });
    expect(breaks.every((character) => character === "/")).toBe(true);
  });
}
