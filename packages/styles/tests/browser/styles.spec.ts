import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, test } from "@playwright/test";

const previewUrl = pathToFileURL(fileURLToPath(new URL("../preview/index.html", import.meta.url))).toString();
const vanillaPreviewUrl = `${previewUrl}?env=vanilla`;
const tailwindBuildUrl = `${previewUrl}?env=build`;

interface LinearColor {
  blue: number;
  green: number;
  red: number;
}

interface ButtonIntentToken {
  className: string;
  tokenName: string;
}

const buttonIntentTokens = [
  { className: "primary", tokenName: "primary" },
  { className: "secondary", tokenName: "accent" },
  { className: "success", tokenName: "success" },
  { className: "warning", tokenName: "warning" },
  { className: "destructive", tokenName: "destructive" },
  { className: "info", tokenName: "info" },
] as const satisfies readonly ButtonIntentToken[];

const parseColor = (color: string): LinearColor => {
  const rgbMatch = color.match(/rgba?\(([^)]+)\)/);

  if (rgbMatch) {
    const [red = 0, green = 0, blue = 0] = rgbMatch[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(Number);

    return {
      blue: toLinearRgbChannel(blue / 255),
      green: toLinearRgbChannel(green / 255),
      red: toLinearRgbChannel(red / 255),
    };
  }

  const oklchMatch = color.match(/oklch\(([^)]+)\)/);

  if (oklchMatch) {
    const [lightness = 0, chroma = 0, hue = 0] = oklchMatch[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(Number);

    return oklchToLinearRgb({ chroma, hue, lightness });
  }

  throw new Error(`Unsupported color format: ${color}`);
};

const toLinearRgbChannel = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const oklchToLinearRgb = ({
  chroma,
  hue,
  lightness,
}: {
  chroma: number;
  hue: number;
  lightness: number;
}): LinearColor => {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    blue: clampLinearRgb(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
    green: clampLinearRgb(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    red: clampLinearRgb(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
  };
};

const clampLinearRgb = (channel: number) => Math.min(1, Math.max(0, channel));

const getRelativeLuminance = ({ blue, green, red }: LinearColor) => 0.2126 * red + 0.7152 * green + 0.0722 * blue;

const getContrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = getRelativeLuminance(parseColor(foreground));
  const backgroundLuminance = getRelativeLuminance(parseColor(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};

test.describe("compiled CSS preview", () => {
  test("loads canonical compiled styles with tokens and components", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Typography" })).toBeVisible();

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

  test("exposes foundation tokens", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const tokenValues = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        containerMax: styles.getPropertyValue("--container-max").trim(),
        controlHeight: styles.getPropertyValue("--control-height").trim(),
        focusRing: styles.getPropertyValue("--focus-ring").trim(),
        motionDurationFast: styles.getPropertyValue("--motion-duration-fast").trim(),
        motionDurationNormal: styles.getPropertyValue("--motion-duration-normal").trim(),
        radiusControl: styles.getPropertyValue("--radius-control").trim(),
        elevationLow: styles.getPropertyValue("--elevation-low").trim(),
      };
    });

    expect(tokenValues.containerMax).not.toBe("");
    expect(tokenValues.controlHeight).not.toBe("");
    expect(tokenValues.focusRing).not.toBe("");
    expect(tokenValues.motionDurationFast).not.toBe("");
    expect(tokenValues.motionDurationNormal).not.toBe("");
    expect(tokenValues.radiusControl).not.toBe("");
    expect(tokenValues.elevationLow).not.toBe("");
  });

  test("exposes semantic hover color tokens", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const tokenValues = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        destructiveHover: styles.getPropertyValue("--color-destructive-hover").trim(),
        infoHover: styles.getPropertyValue("--color-info-hover").trim(),
        successHover: styles.getPropertyValue("--color-success-hover").trim(),
        warningHover: styles.getPropertyValue("--color-warning-hover").trim(),
      };
    });

    expect(tokenValues.destructiveHover).not.toBe("");
    expect(tokenValues.infoHover).not.toBe("");
    expect(tokenValues.successHover).not.toBe("");
    expect(tokenValues.warningHover).not.toBe("");
  });

  test("does not expose legacy root tokens", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const tokenValues = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        motionDuration: styles.getPropertyValue("--motion-duration").trim(),
        shadowOverlay: styles.getPropertyValue("--shadow-overlay").trim(),
        shadowSurface: styles.getPropertyValue("--shadow-surface").trim(),
      };
    });

    expect(tokenValues.motionDuration).toBe("");
    expect(tokenValues.shadowOverlay).toBe("");
    expect(tokenValues.shadowSurface).toBe("");
  });

  test("keeps filled semantic button text readable", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const buttonColors = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ".btn.success:not(.out):not(.ghost):not(.soft), .btn.warning:not(.out):not(.ghost):not(.soft), .btn.destructive:not(.out):not(.ghost):not(.soft), .btn.info:not(.out):not(.ghost):not(.soft)",
        ),
      ].map((button) => {
        const styles = getComputedStyle(button);

        return {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          label: button.textContent?.trim() ?? button.className,
        };
      }),
    );

    for (const button of buttonColors) {
      expect(getContrastRatio(button.color, button.backgroundColor), button.label).toBeGreaterThanOrEqual(3);
    }
  });

  test("composes button intent classes with presentation classes", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const styles = await page.evaluate(() => {
      const successButton = document.querySelector('[data-testid="success-button"]');
      const successOutlineButton = document.querySelector('[data-testid="success-outline-button"]');
      const successSoftButton = document.querySelector('[data-testid="success-soft-button"]');
      const primaryPillButton = document.querySelector('[data-testid="primary-pill-button"]');
      const secondaryGhostButton = document.querySelector('[data-testid="secondary-ghost-button"]');
      const secondaryButton = document.querySelector('[data-testid="secondary-button"]');
      const loadingButton = document.querySelector('[data-testid="loading-button"]');
      const ariaDisabledButton = document.querySelector('[data-testid="aria-disabled-button"]');
      const errorButton = document.querySelector('[data-testid="error-button"]');
      const fieldErrorButton = document.querySelector('[data-testid="field-error-button"]');

      if (
        !successButton ||
        !successOutlineButton ||
        !successSoftButton ||
        !primaryPillButton ||
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
      const successSoftStyles = getComputedStyle(successSoftButton);
      const primaryPillStyles = getComputedStyle(primaryPillButton);
      const secondaryGhostStyles = getComputedStyle(secondaryGhostButton);
      const secondaryButtonStyles = getComputedStyle(secondaryButton);
      const loadingRootStyles = getComputedStyle(loadingButton);
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
        loadingSpinnerAnimation:
          loadingButtonStyles.animationName !== "none"
            ? loadingButtonStyles.animationName
            : loadingButtonStyles.maskImage || loadingButtonStyles.webkitMaskImage || "none",
        loadingSpinnerHeight: loadingButtonStyles.height,
        loadingSpinnerLeft: loadingButtonStyles.left,
        loadingSpinnerTranslate: loadingButtonStyles.translate,
        loadingTransitionProperty: loadingRootStyles.transitionProperty,
        loadingSpinnerWidth: loadingButtonStyles.width,
        loadingSpinnerTop: loadingButtonStyles.top,
        successBackground: successButtonStyles.backgroundColor,
        successOutlineBackground: successOutlineStyles.backgroundColor,
        successOutlineBorder: successOutlineStyles.borderColor,
        successOutlineColor: successOutlineStyles.color,
        successSoftBackground: successSoftStyles.backgroundColor,
        successSoftColor: successSoftStyles.color,
        primaryPillBorderRadius: primaryPillStyles.borderRadius,
      };
    });

    expect(styles.successOutlineBorder).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.successOutlineColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.successOutlineBackground).toBe("rgba(0, 0, 0, 0)");
    expect(styles.ghostBackground).toBe("rgba(0, 0, 0, 0)");
    expect(styles.ghostColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.successSoftBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.successSoftColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(Number.parseFloat(styles.primaryPillBorderRadius)).toBeGreaterThan(20);
    expect(styles.loadingSpinnerAnimation).not.toBe("none");
    expect(Number.parseFloat(styles.loadingSpinnerTop)).toBeCloseTo(styles.loadingButtonHeight / 2, 1);
    expect(Number.parseFloat(styles.loadingSpinnerLeft)).toBeCloseTo(styles.loadingButtonWidth / 2, 1);
    expect(styles.loadingSpinnerTranslate).toBe("-50% -50%");
    expect(styles.loadingTransitionProperty).not.toContain("background-color");
    expect(styles.loadingTransitionProperty).not.toContain("color");
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

  test("uses intent tone slots for button presentation classes", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const buttonPresentationStyles = await page.evaluate((intents) => {
      const resolveTokenColor = ({ host, tokenName }: { host: Element; tokenName: string }) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        host.append(probe);

        const color = getComputedStyle(probe).color;
        probe.remove();

        return color;
      };

      const readButtonStyles = ({
        host,
        intent,
        theme,
      }: {
        host: Element;
        intent: ButtonIntentToken;
        theme: "dark" | "light";
      }) => {
        const outlineButton = document.createElement("button");
        const ghostButton = document.createElement("button");
        const softButton = document.createElement("button");

        outlineButton.className = `btn ${intent.className} out`;
        ghostButton.className = `btn ${intent.className} ghost`;
        softButton.className = `btn ${intent.className} soft`;
        host.append(outlineButton, ghostButton, softButton);

        const outlineStyles = getComputedStyle(outlineButton);
        const ghostStyles = getComputedStyle(ghostButton);
        const softStyles = getComputedStyle(softButton);

        const styles = {
          expectedPresentationText: resolveTokenColor({
            host,
            tokenName: `${intent.tokenName}-strong`,
          }),
          expectedOutlineColor: resolveTokenColor({
            host,
            tokenName: intent.tokenName,
          }),
          expectedSoftBackground: resolveTokenColor({
            host,
            tokenName: `${intent.tokenName}-subtle`,
          }),
          ghostColor: ghostStyles.color,
          intent: intent.className,
          outlineBorderColor: outlineStyles.borderColor,
          outlineColor: outlineStyles.color,
          softBackground: softStyles.backgroundColor,
          softColor: softStyles.color,
          theme,
        };

        outlineButton.remove();
        ghostButton.remove();
        softButton.remove();

        return styles;
      };

      const darkHost = document.createElement("section");
      darkHost.className = "dark";
      document.body.append(darkHost);

      const styles = intents.flatMap((intent) => [
        readButtonStyles({ host: document.body, intent, theme: "light" }),
        readButtonStyles({ host: darkHost, intent, theme: "dark" }),
      ]);

      darkHost.remove();

      return styles;
    }, buttonIntentTokens);

    for (const styles of buttonPresentationStyles) {
      const label = `${styles.theme} ${styles.intent}`;

      expect(styles.outlineColor, `${label} outline color`).toBe(styles.expectedOutlineColor);
      expect(styles.outlineBorderColor, `${label} outline border`).toBe(styles.expectedOutlineColor);
      expect(styles.ghostColor, `${label} ghost color`).toBe(styles.expectedPresentationText);
      expect(styles.softColor, `${label} soft color`).toBe(styles.expectedPresentationText);
      expect(styles.softBackground, `${label} soft background`).toBe(styles.expectedSoftBackground);
    }
  });

  test("uses contrast text on filled outline hover", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const successContrast = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-success-contrast)";
      document.body.append(probe);

      const color = getComputedStyle(probe).color;
      probe.remove();

      return color;
    });

    await page.getByTestId("success-outline-button").hover();

    await expect
      .poll(() => page.getByTestId("success-outline-button").evaluate((element) => getComputedStyle(element).color))
      .toBe(successContrast);
  });

  test("styles layout, form, and feedback helper classes", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const styles = await page.evaluate(() => {
      const layoutSection = document.querySelector('[data-testid="layout-section"]');
      const clusterLayout = document.querySelector('[data-testid="cluster-layout"]');
      const invalidInput = document.querySelector('[data-testid="invalid-input"]');
      const successAlert = document.querySelector('[data-testid="default-success-alert"]');
      const successAlertIcon = document.querySelector('[data-testid="default-success-alert-icon"]');
      const skeletonBlock = document.querySelector('[data-testid="skeleton-block"]');
      const progressBar = document.querySelector('[data-testid="progress-bar"]');

      if (
        !layoutSection ||
        !clusterLayout ||
        !invalidInput ||
        !successAlert ||
        !successAlertIcon ||
        !skeletonBlock ||
        !progressBar
      ) {
        throw new Error("Expected helper class fixtures to exist.");
      }

      const layoutStyles = getComputedStyle(layoutSection);
      const clusterStyles = getComputedStyle(clusterLayout);
      const invalidInputStyles = getComputedStyle(invalidInput);
      const successAlertStyles = getComputedStyle(successAlert);
      const successAlertIconStyles = getComputedStyle(successAlertIcon);
      const skeletonStyles = getComputedStyle(skeletonBlock);
      const progressStyles = getComputedStyle(progressBar);

      return {
        alertBorderWidth: successAlertStyles.borderWidth,
        alertColor: successAlertStyles.color,
        alertPaddingLeft: successAlertStyles.paddingLeft,
        alertIconPaddingLeft: successAlertIconStyles.paddingLeft,
        clusterDisplay: clusterStyles.display,
        invalidBorderColor: invalidInputStyles.borderColor,
        layoutDisplay: layoutStyles.display,
        layoutMaxWidth: layoutStyles.maxWidth,
        progressOverflow: progressStyles.overflow,
        skeletonAnimationName: skeletonStyles.animationName,
      };
    });

    expect(styles.layoutDisplay).toBe("flex");
    expect(styles.layoutMaxWidth).not.toBe("none");
    expect(styles.clusterDisplay).toBe("flex");
    expect(styles.invalidBorderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.alertBorderWidth).not.toBe("0px");
    expect(styles.alertColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.alertIconPaddingLeft).toBe("44px");
    expect(styles.skeletonAnimationName).not.toBe("none");
    expect(styles.progressOverflow).toBe("hidden");
  });

  test("renders flat, soft, and left-accent alert variants with correct styles", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    // Flat info alert
    const flatInfoStyles = await page.getByTestId("flat-info-alert").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
      };
    });
    expect(flatInfoStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(flatInfoStyles.color).not.toBe(flatInfoStyles.backgroundColor);

    // Left accent success alert
    const leftAccentSuccessStyles = await page.getByTestId("left-accent-success-alert").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderLeftWidth: styles.borderLeftWidth,
        borderTopColor: styles.borderTopColor,
        borderRightColor: styles.borderRightColor,
      };
    });
    expect(leftAccentSuccessStyles.borderLeftWidth).toBe("4px");
    expect(leftAccentSuccessStyles.borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(leftAccentSuccessStyles.borderRightColor).toBe("rgba(0, 0, 0, 0)");

    // Soft warning alert
    const softWarningStyles = await page.getByTestId("soft-warning-alert").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
      };
    });
    expect(softWarningStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(softWarningStyles.color).not.toBe(softWarningStyles.backgroundColor);
    expect(softWarningStyles.borderColor).toBe("rgba(0, 0, 0, 0)");
  });

  test("renders flat and soft badge variants with correct styles", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    // Flat badge: background = intent color, border = intent color (non-transparent)
    const flatBadgeStyles = await page.getByTestId("badge-flat-info").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
      };
    });
    expect(flatBadgeStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(flatBadgeStyles.color).not.toBe(flatBadgeStyles.backgroundColor);
    expect(flatBadgeStyles.borderColor).not.toBe("rgba(0, 0, 0, 0)");

    // Primary flat badge should have background = primary color, color = primary-contrast color
    const flatPrimaryBadgeStyles = await page.getByTestId("badge-flat-primary").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });
    const expectedPrimaryColors = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-primary)";
      const probeContrast = document.createElement("span");
      probeContrast.style.color = "var(--color-primary-contrast)";
      document.body.append(probe, probeContrast);
      const colors = {
        primary: getComputedStyle(probe).color,
        contrast: getComputedStyle(probeContrast).color,
      };
      probe.remove();
      probeContrast.remove();
      return colors;
    });
    expect(flatPrimaryBadgeStyles.backgroundColor).toBe(expectedPrimaryColors.primary);
    expect(flatPrimaryBadgeStyles.color).toBe(expectedPrimaryColors.contrast);

    // Secondary flat badge should have background = accent color, color = accent-contrast color
    const flatSecondaryBadgeStyles = await page.getByTestId("badge-flat-secondary").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });
    const expectedSecondaryColors = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-accent)";
      const probeContrast = document.createElement("span");
      probeContrast.style.color = "var(--color-accent-contrast)";
      document.body.append(probe, probeContrast);
      const colors = {
        accent: getComputedStyle(probe).color,
        contrast: getComputedStyle(probeContrast).color,
      };
      probe.remove();
      probeContrast.remove();
      return colors;
    });
    expect(flatSecondaryBadgeStyles.backgroundColor).toBe(expectedSecondaryColors.accent);
    expect(flatSecondaryBadgeStyles.color).toBe(expectedSecondaryColors.contrast);

    // Soft badge: tinted background, no border
    const softBadgeStyles = await page.getByTestId("badge-soft-success").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
      };
    });
    expect(softBadgeStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(softBadgeStyles.borderColor).toBe("rgba(0, 0, 0, 0)");
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

  test("shows the alternate preview environment in the environment toggle tooltip", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    await expect(page.getByTestId("environment-toggle")).toHaveAttribute("data-tooltip", "See build");

    await page.goto(tailwindBuildUrl);

    await expect(page.getByTestId("environment-toggle")).toHaveAttribute("data-tooltip", "See vanilla");
  });

  test("switches between preview environments from the environment toggle", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    await page.getByTestId("environment-toggle").click();

    await expect(page).toHaveURL(/env=build/);
    await expect(page.locator("html")).toHaveAttribute("data-env", "build");

    await page.getByTestId("environment-toggle").click();

    await expect(page).toHaveURL(/env=vanilla/);
    await expect(page.locator("html")).toHaveAttribute("data-env", "vanilla");
  });

  test("applies intent classes to checkbox, switch, and progress bar", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const intentStyles = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };

      const getCheckedBg = (testId: string) => {
        const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | null;
        if (!el) {
          throw new Error(`Missing fixture: ${testId}`);
        }
        return getComputedStyle(el).backgroundColor;
      };

      const getProgressFill = (testId: string) => {
        const el = document.querySelector(`[data-testid="${testId}"] > *`) as HTMLElement | null;
        if (!el) {
          throw new Error(`Missing fixture: ${testId}`);
        }
        return getComputedStyle(el).backgroundColor;
      };

      return {
        checkboxPrimary: getCheckedBg("checkbox-primary"),
        checkboxSecondary: getCheckedBg("checkbox-secondary"),
        checkboxSuccess: getCheckedBg("checkbox-success"),
        checkboxWarning: getCheckedBg("checkbox-warning"),
        checkboxDestructive: getCheckedBg("checkbox-destructive"),
        checkboxInfo: getCheckedBg("checkbox-info"),
        switchPrimary: getCheckedBg("switch-primary"),
        switchSecondary: getCheckedBg("switch-secondary"),
        switchSuccess: getCheckedBg("switch-success"),
        switchWarning: getCheckedBg("switch-warning"),
        switchDestructive: getCheckedBg("switch-destructive"),
        switchInfo: getCheckedBg("switch-info"),
        progressPrimary: getProgressFill("progress-bar-primary"),
        progressSecondary: getProgressFill("progress-bar-secondary"),
        progressSuccess: getProgressFill("progress-bar-success"),
        progressWarning: getProgressFill("progress-bar-warning"),
        progressDestructive: getProgressFill("progress-bar-destructive"),
        progressInfo: getProgressFill("progress-bar-info"),
        tokenPrimary: resolveToken("primary"),
        tokenSecondary: resolveToken("accent"),
        tokenSuccess: resolveToken("success"),
        tokenWarning: resolveToken("warning"),
        tokenDestructive: resolveToken("destructive"),
        tokenInfo: resolveToken("info"),
      };
    });

    expect(intentStyles.checkboxPrimary).toBe(intentStyles.tokenPrimary);
    expect(intentStyles.checkboxSecondary).toBe(intentStyles.tokenSecondary);
    expect(intentStyles.checkboxSuccess).toBe(intentStyles.tokenSuccess);
    expect(intentStyles.checkboxWarning).toBe(intentStyles.tokenWarning);
    expect(intentStyles.checkboxDestructive).toBe(intentStyles.tokenDestructive);
    expect(intentStyles.checkboxInfo).toBe(intentStyles.tokenInfo);
    expect(intentStyles.switchPrimary).toBe(intentStyles.tokenPrimary);
    expect(intentStyles.switchSecondary).toBe(intentStyles.tokenSecondary);
    expect(intentStyles.switchSuccess).toBe(intentStyles.tokenSuccess);
    expect(intentStyles.switchWarning).toBe(intentStyles.tokenWarning);
    expect(intentStyles.switchDestructive).toBe(intentStyles.tokenDestructive);
    expect(intentStyles.switchInfo).toBe(intentStyles.tokenInfo);
    expect(intentStyles.progressPrimary).toBe(intentStyles.tokenPrimary);
    expect(intentStyles.progressSecondary).toBe(intentStyles.tokenSecondary);
    expect(intentStyles.progressSuccess).toBe(intentStyles.tokenSuccess);
    expect(intentStyles.progressWarning).toBe(intentStyles.tokenWarning);
    expect(intentStyles.progressDestructive).toBe(intentStyles.tokenDestructive);
    expect(intentStyles.progressInfo).toBe(intentStyles.tokenInfo);
  });

  test("renders checkbox and switch with correct appearance and transitions", async ({ page }) => {
    await page.goto(vanillaPreviewUrl);

    const checkbox = page.getByTestId("checkbox-test");
    const checkboxChecked = page.getByTestId("checkbox-checked-test");
    const switchElement = page.getByTestId("switch-test");
    const switchChecked = page.getByTestId("switch-checked-test");

    await expect(checkbox).toBeVisible();
    await expect(checkboxChecked).toBeVisible();
    await expect(switchElement).toBeVisible();
    await expect(switchChecked).toBeVisible();

    const checkboxStyles = await checkbox.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        appearance: styles.appearance,
        width: styles.width,
        height: styles.height,
        cursor: styles.cursor,
      };
    });

    expect(checkboxStyles.appearance).toBe("none");
    expect(checkboxStyles.width).toBe("16px");
    expect(checkboxStyles.height).toBe("16px");
    expect(checkboxStyles.cursor).toBe("pointer");

    const switchStyles = await switchElement.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        appearance: styles.appearance,
        width: styles.width,
        height: styles.height,
        cursor: styles.cursor,
      };
    });

    expect(switchStyles.appearance).toBe("none");
    expect(switchStyles.width).toBe("36px");
    expect(switchStyles.height).toBe("18px");
    expect(switchStyles.cursor).toBe("pointer");
  });
});

test.describe("Tailwind source build", () => {});
