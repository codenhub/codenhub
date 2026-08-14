import { expect, test } from "@playwright/test";

const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";
const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";
const PLATFORM = process.platform;

test.skip(({ browserName }) => browserName !== "chromium", "Reviewed visual baselines use Chromium");

/* Headless Chromium reports `prefers-reduced-transparency: reduce` in this
   environment and other machines do not, and glass renders opaque and unblurred
   under it -- correctly, but from the same stylesheet. A baseline taken without
   pinning the preference therefore differs per machine, so every snapshot here
   is taken with transparency allowed: the aesthetic as authored. The degradation
   is a computed-style contract, asserted in `aesthetics.spec.ts`. */
test.beforeEach(async ({ page }) => {
  const session = await page.context().newCDPSession(page);

  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "no-preference" }],
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`matches the ${theme} button matrix`, async ({ page }) => {
    await page.addInitScript((selectedTheme) => localStorage.setItem("theme", selectedTheme), theme);
    await page.goto(BUTTONS_URL);

    await expect(page.getByTestId("btn-matrix")).toHaveScreenshot(`buttons-${theme}-${PLATFORM}.png`, {
      animations: "disabled",
    });
  });
}

for (const aesthetic of ["neobrutalism", "glass", "pixel"] as const) {
  test(`matches the ${aesthetic} surface matrix`, async ({ page }) => {
    await page.goto(`${SURFACES_URL}&theme=light&aesthetic=${aesthetic}`);

    await expect(page.getByTestId("card-matrix")).toHaveScreenshot(`surfaces-${aesthetic}-${PLATFORM}.png`, {
      animations: "disabled",
    });
  });
}
