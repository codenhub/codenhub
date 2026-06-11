import { expect, test } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";

const previewUrl = pathToFileURL(fileURLToPath(new URL("../preview/index.html", import.meta.url))).toString();
const vanillaPreviewUrl = `${previewUrl}?env=vanilla`;
const tailwindBuildUrl = `${previewUrl}?env=build`;

test.describe("compiled CSS preview", () => {
  test("loads canonical compiled styles with tokens and components", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Light tokens" })).toBeVisible();

    const primaryButtonStyles = await page.getByTestId("primary-button").evaluate((element) => {
      const styles = getComputedStyle(element);

      return {
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius,
        color: styles.color,
      };
    });

    expect(primaryButtonStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(primaryButtonStyles.color).not.toBe(primaryButtonStyles.backgroundColor);
    expect(primaryButtonStyles.borderRadius).not.toBe("0px");
  });

  test("applies dark tokens through the dark class", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const colors = await page.evaluate(() => {
      const lightCard = document.querySelector('[data-testid="light-card"]');
      const darkCard = document.querySelector('[data-testid="dark-card"]');

      if (!lightCard || !darkCard) {
        throw new Error("Expected light and dark cards to exist.");
      }

      return {
        darkBackground: getComputedStyle(darkCard).backgroundColor,
        lightBackground: getComputedStyle(lightCard).backgroundColor,
        lightButtonBackground: getComputedStyle(document.querySelector('[data-testid="primary-button"]')!)
          .backgroundColor,
        darkButtonBackground: getComputedStyle(document.querySelector('[data-testid="dark-primary-button"]')!)
          .backgroundColor,
      };
    });

    expect(colors.darkBackground).not.toBe(colors.lightBackground);
    expect(colors.darkButtonBackground).not.toBe(colors.lightButtonBackground);
  });
});

test.describe("Tailwind source build", () => {
  test("builds token utilities, components, and responsive variants", async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 700 });
    await page.goto(tailwindBuildUrl);

    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build-time tokens" })).toBeVisible();

    const cardStyles = await page.getByTestId("responsive-card").evaluate((element) => {
      const styles = getComputedStyle(element);

      return {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        display: styles.display,
        fontFamily: styles.fontFamily,
      };
    });

    expect(cardStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(cardStyles.borderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(cardStyles.display).toBe("flex");
    expect(cardStyles.fontFamily).toContain("Segoe UI");
  });

  test("builds dark variants for token utilities", async ({ page }) => {
    await page.goto(tailwindBuildUrl);

    const darkVariantColor = await page
      .getByTestId("dark-variant-text")
      .evaluate((element) => getComputedStyle(element).color);
    const darkPrimaryBackground = await page
      .getByTestId("dark-primary-button")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(darkVariantColor).toBe(darkPrimaryBackground);
  });
});
