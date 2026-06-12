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

  test("exposes v0.0.2 foundation tokens", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const tokenValues = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        containerMax: styles.getPropertyValue("--container-max").trim(),
        controlHeight: styles.getPropertyValue("--control-height").trim(),
        focusRing: styles.getPropertyValue("--focus-ring").trim(),
        motionDuration: styles.getPropertyValue("--motion-duration").trim(),
        radiusControl: styles.getPropertyValue("--radius-control").trim(),
        shadowSurface: styles.getPropertyValue("--shadow-surface").trim(),
      };
    });

    expect(tokenValues.containerMax).not.toBe("");
    expect(tokenValues.controlHeight).not.toBe("");
    expect(tokenValues.focusRing).not.toBe("");
    expect(tokenValues.motionDuration).not.toBe("");
    expect(tokenValues.radiusControl).not.toBe("");
    expect(tokenValues.shadowSurface).not.toBe("");
  });

  test("composes button intent classes with presentation classes", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const styles = await page.evaluate(() => {
      const successButton = document.querySelector('[data-testid="success-button"]');
      const successOutlineButton = document.querySelector('[data-testid="success-outline-button"]');
      const secondaryGhostButton = document.querySelector('[data-testid="secondary-ghost-button"]');
      const secondaryButton = document.querySelector('[data-testid="secondary-button"]');
      const loadingButton = document.querySelector('[data-testid="loading-button"]');
      const ariaDisabledButton = document.querySelector('[data-testid="aria-disabled-button"]');
      const errorButton = document.querySelector('[data-testid="error-button"]');
      const fieldErrorButton = document.querySelector('[data-testid="field-error-button"]');

      if (
        !successButton ||
        !successOutlineButton ||
        !secondaryGhostButton ||
        !secondaryButton ||
        !loadingButton ||
        !ariaDisabledButton ||
        !errorButton ||
        !fieldErrorButton
      ) {
        throw new Error("Expected button composition fixtures to exist.");
      }

      const successButtonStyles = getComputedStyle(successButton);
      const successOutlineStyles = getComputedStyle(successOutlineButton);
      const secondaryGhostStyles = getComputedStyle(secondaryGhostButton);
      const secondaryButtonStyles = getComputedStyle(secondaryButton);
      const loadingButtonStyles = getComputedStyle(loadingButton, "::after");
      const ariaDisabledStyles = getComputedStyle(ariaDisabledButton);
      const errorButtonStyles = getComputedStyle(errorButton);
      const fieldErrorButtonStyles = getComputedStyle(fieldErrorButton);

      return {
        disabledCursor: ariaDisabledStyles.cursor,
        disabledOpacity: ariaDisabledStyles.opacity,
        errorBackground: errorButtonStyles.backgroundColor,
        errorColor: errorButtonStyles.color,
        fieldErrorBackground: fieldErrorButtonStyles.backgroundColor,
        fieldErrorColor: fieldErrorButtonStyles.color,
        ghostBackground: secondaryGhostStyles.backgroundColor,
        ghostColor: secondaryGhostStyles.color,
        secondaryBackground: secondaryButtonStyles.backgroundColor,
        loadingButtonHeight: loadingButton.getBoundingClientRect().height,
        loadingButtonWidth: loadingButton.getBoundingClientRect().width,
        loadingSpinnerAnimation: loadingButtonStyles.animationName,
        loadingSpinnerHeight: loadingButtonStyles.height,
        loadingSpinnerLeft: loadingButtonStyles.left,
        loadingSpinnerTranslate: loadingButtonStyles.translate,
        loadingSpinnerWidth: loadingButtonStyles.width,
        loadingSpinnerTop: loadingButtonStyles.top,
        successBackground: successButtonStyles.backgroundColor,
        successOutlineBackground: successOutlineStyles.backgroundColor,
        successOutlineBorder: successOutlineStyles.borderColor,
        successOutlineColor: successOutlineStyles.color,
      };
    });

    expect(styles.successOutlineBorder).toBe(styles.successBackground);
    expect(styles.successOutlineColor).toBe(styles.successBackground);
    expect(styles.successOutlineBackground).toBe("rgba(0, 0, 0, 0)");
    expect(styles.ghostBackground).toBe("rgba(0, 0, 0, 0)");
    expect(styles.ghostColor).not.toBe(styles.secondaryBackground);
    expect(styles.ghostColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.loadingSpinnerAnimation).not.toBe("none");
    expect(Number.parseFloat(styles.loadingSpinnerTop)).toBeCloseTo(styles.loadingButtonHeight / 2, 1);
    expect(Number.parseFloat(styles.loadingSpinnerLeft)).toBeCloseTo(styles.loadingButtonWidth / 2, 1);
    expect(styles.loadingSpinnerTranslate).toBe("-50% -50%");
    expect(styles.loadingSpinnerWidth).not.toBe("0px");
    expect(styles.loadingSpinnerHeight).not.toBe("0px");
    expect(styles.errorColor).not.toBe(styles.errorBackground);
    expect(styles.fieldErrorColor).not.toBe(styles.fieldErrorBackground);
    expect(styles.disabledCursor).toBe("not-allowed");
    expect(Number(styles.disabledOpacity)).toBeLessThan(1);

    await page.getByTestId("secondary-ghost-button").hover();

    const ghostHoverBackground = await page
      .getByTestId("secondary-ghost-button")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(ghostHoverBackground).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("styles layout, form, and feedback helper classes", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const styles = await page.evaluate(() => {
      const layoutSection = document.querySelector('[data-testid="layout-section"]');
      const clusterLayout = document.querySelector('[data-testid="cluster-layout"]');
      const autoGridLayout = document.querySelector('[data-testid="auto-grid-layout"]');
      const invalidInput = document.querySelector('[data-testid="invalid-input"]');
      const successAlert = document.querySelector('[data-testid="success-alert"]');
      const infoToast = document.querySelector('[data-testid="info-toast"]');
      const skeletonBlock = document.querySelector('[data-testid="skeleton-block"]');
      const progressBar = document.querySelector('[data-testid="progress-bar"]');

      if (
        !layoutSection ||
        !clusterLayout ||
        !autoGridLayout ||
        !invalidInput ||
        !successAlert ||
        !infoToast ||
        !skeletonBlock ||
        !progressBar
      ) {
        throw new Error("Expected helper class fixtures to exist.");
      }

      const layoutStyles = getComputedStyle(layoutSection);
      const clusterStyles = getComputedStyle(clusterLayout);
      const autoGridStyles = getComputedStyle(autoGridLayout);
      const invalidInputStyles = getComputedStyle(invalidInput);
      const successAlertStyles = getComputedStyle(successAlert);
      const infoToastStyles = getComputedStyle(infoToast);
      const skeletonStyles = getComputedStyle(skeletonBlock);
      const progressStyles = getComputedStyle(progressBar);

      return {
        alertBorderWidth: successAlertStyles.borderWidth,
        alertColor: successAlertStyles.color,
        autoGridDisplay: autoGridStyles.display,
        clusterDisplay: clusterStyles.display,
        invalidBorderColor: invalidInputStyles.borderColor,
        layoutDisplay: layoutStyles.display,
        layoutMaxWidth: layoutStyles.maxWidth,
        progressOverflow: progressStyles.overflow,
        skeletonAnimationName: skeletonStyles.animationName,
        toastPosition: infoToastStyles.position,
      };
    });

    expect(styles.layoutDisplay).toBe("flex");
    expect(styles.layoutMaxWidth).not.toBe("none");
    expect(styles.clusterDisplay).toBe("flex");
    expect(styles.autoGridDisplay).toBe("grid");
    expect(styles.invalidBorderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.alertBorderWidth).not.toBe("0px");
    expect(styles.alertColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.toastPosition).toBe("fixed");
    expect(styles.skeletonAnimationName).not.toBe("none");
    expect(styles.progressOverflow).toBe("hidden");
  });

  test("uses a default tooltip position when no position attribute is set", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const tooltipStyles = await page.getByTestId("fallback-tooltip").evaluate((element) => {
      const styles = getComputedStyle(element, "::after");

      return {
        left: styles.left,
        top: styles.top,
        transformOrigin: styles.transformOrigin,
      };
    });

    expect(tooltipStyles.left).not.toBe("auto");
    expect(tooltipStyles.top).not.toBe("auto");
    expect(tooltipStyles.transformOrigin).not.toBe("");
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
