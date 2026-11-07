import type { Locator } from "@playwright/test";

import { expect, test } from "./fixtures";

// The card builds its icons in a client script, out of reach of the icons
// plugin's build-time rewrite; in CSS mode they rendered as solid squares.
test("draws every icon in a site link's preview card", async ({ page }) => {
  await page.goto("/toaster/");

  await page.locator('.markdown-content a[href="/toaster/toasts/"]').first().hover();
  const card = page.locator("[data-link-preview]");
  await expect(card).toBeVisible();

  const trail = card.locator(".link-preview-trail svg");
  const actions = card.locator(".link-preview-action > svg:first-child");
  // One trail separator, then the copy, new-tab, and open actions.
  await expect(trail).toHaveCount(1);
  await expect(actions).toHaveCount(3);

  // Each icon draws, at the size its `--ic-size` sets: 0.875rem in the trail, 1rem on an action.
  const expectDrawn = async (icon: Locator, size: number) => {
    await expect(icon).toBeVisible();
    await expect(icon.locator("path").first()).toHaveAttribute("d", /\S/);
    expect(await icon.evaluate((element) => element.getBoundingClientRect().width)).toBe(size);
  };
  await Promise.all([
    ...(await trail.all()).map((icon) => expectDrawn(icon, 14)),
    ...(await actions.all()).map((icon) => expectDrawn(icon, 16)),
  ]);
});
