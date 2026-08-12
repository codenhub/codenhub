import { expect, test } from "@playwright/test";

const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";
const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";

test.skip(({ browserName }) => browserName !== "chromium", "Reviewed visual baselines use Chromium");

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
