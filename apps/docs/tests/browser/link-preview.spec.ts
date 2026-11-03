import { expect, test } from "./fixtures";

// The card builds its icons in a client script, out of reach of the icons
// plugin's build-time rewrite; in CSS mode they rendered as solid squares.
test("draws every icon in a site link's preview card", async ({ page }) => {
  await page.goto("/toaster/");

  await page.locator('.markdown-content a[href="/toaster/concepts/"]').first().hover();
  const card = page.locator("[data-link-preview]");
  await expect(card).toBeVisible();

  const icons = card.locator(".link-preview-trail svg, .link-preview-action > svg:first-child");
  // One trail separator, then the copy, new-tab, and open actions.
  await expect(icons).toHaveCount(4);
  await Promise.all(
    (await icons.all()).flatMap((icon) => [
      expect(icon).toBeVisible(),
      expect(icon.locator("path").first()).toBeAttached(),
    ]),
  );
});
