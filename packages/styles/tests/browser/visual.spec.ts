import { expect, test } from "@playwright/test";

const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";
const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";

test.skip(({ browserName }) => browserName !== "chromium", "Reviewed visual baselines use Chromium");

/* One environment holds the baselines, and it is the one that gates a merge.
   Splitting them per platform meant a contributor on a new OS committed a set
   nobody else ever ran, and the fonts and antialiasing of each OS made the sets
   impossible to compare with each other -- so the count grew and the value did
   not. Every other browser spec still runs locally; only these five assertions
   need an environment we agree on. */
test.skip(() => !process.env.CI, "Visual baselines are reviewed on CI, the environment that gates a merge");

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

    await expect(page.getByTestId("btn-matrix")).toHaveScreenshot(`buttons-${theme}.png`, {
      animations: "disabled",
    });
  });
}

for (const aesthetic of ["neobrutalism", "glass", "pixel"] as const) {
  test(`matches the ${aesthetic} surface matrix`, async ({ page }) => {
    await page.goto(`${SURFACES_URL}&theme=light&aesthetic=${aesthetic}`);

    await expect(page.getByTestId("card-matrix")).toHaveScreenshot(`surfaces-${aesthetic}.png`, {
      animations: "disabled",
    });
  });
}
