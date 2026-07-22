import { expect, test } from "@playwright/test";

import { BUTTON_INTENT_TOKENS, getContrastRatio, type ButtonIntentToken } from "./test-utils";

const COMPONENTS_URL = "http://localhost:5184/components/?env=vanilla";

test.describe("components", () => {
  test("loads canonical compiled styles with tokens and components", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Components" })).toBeVisible();

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

  test("keeps filled semantic button text readable", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

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
    await page.goto(COMPONENTS_URL);

    const styles = await page.evaluate(() => {
      const successOutlineButton = document.querySelector('[data-testid="success-outline-button"]');
      const successSoftButton = document.querySelector('[data-testid="success-soft-button"]');
      const primaryPillButton = document.querySelector('[data-testid="primary-pill-button"]');
      const secondaryGhostButton = document.querySelector('[data-testid="secondary-ghost-button"]');

      if (!successOutlineButton || !successSoftButton || !primaryPillButton || !secondaryGhostButton) {
        throw new Error("Expected button composition fixtures to exist.");
      }

      const successOutlineStyles = getComputedStyle(successOutlineButton);
      const successSoftStyles = getComputedStyle(successSoftButton);
      const primaryPillStyles = getComputedStyle(primaryPillButton);
      const secondaryGhostStyles = getComputedStyle(secondaryGhostButton);

      return {
        ghostBackground: secondaryGhostStyles.backgroundColor,
        ghostColor: secondaryGhostStyles.color,
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

    await page.getByTestId("secondary-ghost-button").hover();

    const ghostHoverBackground = await page
      .getByTestId("secondary-ghost-button")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(ghostHoverBackground).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("centers the loading spinner without transitioning hidden colors", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const styles = await page.getByTestId("loading-button").evaluate((button) => {
      const rootStyles = getComputedStyle(button);
      const spinnerStyles = getComputedStyle(button, "::after");

      return {
        buttonHeight: button.getBoundingClientRect().height,
        buttonWidth: button.getBoundingClientRect().width,
        spinnerAnimation:
          spinnerStyles.animationName !== "none"
            ? spinnerStyles.animationName
            : spinnerStyles.maskImage || spinnerStyles.webkitMaskImage || "none",
        spinnerHeight: spinnerStyles.height,
        spinnerLeft: spinnerStyles.left,
        spinnerTop: spinnerStyles.top,
        spinnerTranslate: spinnerStyles.translate,
        spinnerWidth: spinnerStyles.width,
        transitionProperty: rootStyles.transitionProperty,
      };
    });

    expect(styles.spinnerAnimation).not.toBe("none");
    expect(Number.parseFloat(styles.spinnerTop)).toBeCloseTo(styles.buttonHeight / 2, 1);
    expect(Number.parseFloat(styles.spinnerLeft)).toBeCloseTo(styles.buttonWidth / 2, 1);
    expect(styles.spinnerTranslate).toBe("-50% -50%");
    expect(styles.transitionProperty).not.toContain("background-color");
    expect(styles.transitionProperty).not.toContain("color");
    expect(styles.spinnerWidth).not.toBe("0px");
    expect(styles.spinnerHeight).not.toBe("0px");
  });

  test("uses loader variants on loading buttons", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const images = await Promise.all(
      ["loading-button", "loading-button-dots", "loading-button-bars"].map((testId) =>
        page
          .getByTestId(testId)
          .evaluate((button) => getComputedStyle(button, "::after").getPropertyValue("--ai-image")),
      ),
    );

    expect(new Set(images).size).toBe(images.length);
  });

  test("styles disabled and error button states", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const styles = await page.evaluate(() => {
      const disabledStyles = getComputedStyle(document.querySelector('[data-testid="aria-disabled-button"]')!);
      const errorStyles = getComputedStyle(document.querySelector('[data-testid="error-button"]')!);
      const fieldErrorStyles = getComputedStyle(document.querySelector('[data-testid="field-error-button"]')!);

      return {
        disabledCursor: disabledStyles.cursor,
        disabledOpacity: disabledStyles.opacity,
        errorBackground: errorStyles.backgroundColor,
        errorColor: errorStyles.color,
        fieldErrorBackground: fieldErrorStyles.backgroundColor,
        fieldErrorColor: fieldErrorStyles.color,
      };
    });

    expect(styles.errorColor).not.toBe(styles.errorBackground);
    expect(styles.fieldErrorColor).not.toBe(styles.fieldErrorBackground);
    expect(styles.disabledCursor).toBe("not-allowed");
    expect(Number(styles.disabledOpacity)).toBeLessThan(1);
  });

  test("hides nested elements inside loading buttons", async ({ page }) => {
    await page.goto(COMPONENTS_URL);
    const childOpacity = await page.evaluate(() => {
      const child = document.querySelector('[data-testid="loading-nested-text"]');
      if (!child) {
        throw new Error("Nested text fixture not found");
      }
      return getComputedStyle(child).opacity;
    });
    expect(childOpacity).toBe("0");
  });

  test("uses intent tone slots for button presentation classes", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

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
    }, BUTTON_INTENT_TOKENS);

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
    await page.goto(COMPONENTS_URL);

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

  test("styles section and cluster layout helpers", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const styles = await page.evaluate(() => {
      const layoutStyles = getComputedStyle(document.querySelector('[data-testid="layout-section"]')!);
      const clusterStyles = getComputedStyle(document.querySelector('[data-testid="cluster-layout"]')!);
      return {
        clusterDisplay: clusterStyles.display,
        layoutDisplay: layoutStyles.display,
        layoutMaxWidth: layoutStyles.maxWidth,
      };
    });

    expect(styles.layoutDisplay).toBe("flex");
    expect(styles.layoutMaxWidth).not.toBe("none");
    expect(styles.clusterDisplay).toBe("flex");
  });

  test("styles invalid fields and success alerts", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const invalidBorderColor = await page
      .getByTestId("invalid-input")
      .evaluate((element) => getComputedStyle(element).borderColor);
    const alertStyles = await page.getByTestId("default-success-alert").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { borderWidth: styles.borderWidth, color: styles.color };
    });
    const alertIconPaddingLeft = await page
      .getByTestId("default-success-alert-icon")
      .evaluate((element) => getComputedStyle(element).paddingLeft);

    expect(invalidBorderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(alertStyles.borderWidth).not.toBe("0px");
    expect(alertStyles.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(alertIconPaddingLeft).toBe("44px");
  });

  test("animates skeletons and styles progress tracks", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const skeletonAnimationName = await page
      .getByTestId("skeleton-block")
      .evaluate((element) => getComputedStyle(element).animationName);
    const progressStyles = await page.getByTestId("progress-bar").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { backgroundColor: styles.backgroundColor, overflow: styles.overflow };
    });

    expect(skeletonAnimationName).not.toBe("none");
    expect(progressStyles.overflow).toBe("hidden");
    expect(progressStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("matches the representative primary progress bar", async ({ browserName, page }) => {
    test.skip(browserName !== "chromium", "The baseline targets the stable Chromium rendering path.");
    await page.goto(COMPONENTS_URL);

    const progressBar = page.getByTestId("progress-bar-primary");
    await progressBar.evaluate((element) => {
      element.style.width = "320px";
    });

    await expect(progressBar).toHaveScreenshot("primary-progress.png", { animations: "disabled" });
  });

  test("sizes loaders and renders every loader variant", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const loaderWidths = await Promise.all(
      ["loader-sm", "loader-default", "loader-lg"].map((testId) =>
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).width),
      ),
    );
    const loaderDefaultMask = await page
      .getByTestId("loader-default")
      .evaluate(
        (element) => getComputedStyle(element).maskImage || getComputedStyle(element).webkitMaskImage || "none",
      );
    const variantIds = [
      "loader-dots-wave",
      "loader-dots-fade",
      "loader-dots-queue",
      "loader-dots-rotate",
      "loader-dots-grow",
      "loader-dots-grow-alternate",
      "loader-dot-bounce",
      "loader-bars-wave",
      "loader-pulse-ring",
    ];
    const variantImages = await Promise.all(
      variantIds.map((testId) =>
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).getPropertyValue("--ai-image")),
      ),
    );

    expect(loaderWidths).toEqual(["24px", "32px", "40px"]);
    expect(loaderDefaultMask).not.toBe("none");
    for (const [index, image] of variantImages.entries()) {
      expect(image, variantIds[index]).toContain("data:image/svg+xml");
    }
  });

  test("preserves a distinct mask for every loader variant", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const testIds = [
      "loader-default",
      "loader-dots-wave",
      "loader-dots-fade",
      "loader-dots-queue",
      "loader-dots-rotate",
      "loader-dots-grow",
      "loader-dots-grow-alternate",
      "loader-dot-bounce",
      "loader-bars-wave",
      "loader-pulse-ring",
    ];
    const images = await Promise.all(
      testIds.map((testId) =>
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).getPropertyValue("--ai-image")),
      ),
    );

    expect(new Set(images).size).toBe(testIds.length);
  });

  test("renders flat, soft, and left-accent alert variants with correct styles", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

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
    await page.goto(COMPONENTS_URL);

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
    await page.goto(COMPONENTS_URL);

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

  test("applies intent classes to checkbox, switch, and progress bar", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

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
        const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
        if (!el) {
          throw new Error(`Missing fixture: ${testId}`);
        }
        return getComputedStyle(el, "::after").backgroundColor;
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
    await page.goto(COMPONENTS_URL);

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
    expect(switchStyles.width).toBe("40px");
    expect(switchStyles.height).toBe("20px");
    expect(switchStyles.cursor).toBe("pointer");

    const checkboxDisabled = page.getByTestId("checkbox-disabled");
    const switchDisabled = page.getByTestId("switch-disabled");
    await expect(checkboxDisabled).toBeVisible();
    await expect(switchDisabled).toBeVisible();

    const checkboxDisabledBorderBeforeHover = await checkboxDisabled.evaluate((el) => getComputedStyle(el).borderColor);
    await checkboxDisabled.hover();
    const checkboxDisabledBorderAfterHover = await checkboxDisabled.evaluate((el) => getComputedStyle(el).borderColor);
    expect(checkboxDisabledBorderAfterHover).toBe(checkboxDisabledBorderBeforeHover);

    const switchDisabledBorderBeforeHover = await switchDisabled.evaluate((el) => getComputedStyle(el).borderColor);
    await switchDisabled.hover();
    const switchDisabledBorderAfterHover = await switchDisabled.evaluate((el) => getComputedStyle(el).borderColor);
    expect(switchDisabledBorderAfterHover).toBe(switchDisabledBorderBeforeHover);
  });

  test("uses default neutral text tokens when no semantic intent is specified", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const values = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };

      const getBg = (testId: string) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        return el ? getComputedStyle(el).backgroundColor : "";
      };

      const getFg = (testId: string) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        return el ? getComputedStyle(el).color : "";
      };

      const getProgressBg = (testId: string) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        return el ? getComputedStyle(el, "::after").backgroundColor : "";
      };

      return {
        btnBg: getBg("neutral-button"),
        btnFg: getFg("neutral-button"),
        checkboxBg: getBg("checkbox-checked-test"),
        switchBg: getBg("switch-checked-test"),
        alertFg: getFg("neutral-alert"),
        badgeFg: getFg("badge-neutral"),
        progressBg: getProgressBg("progress-bar"),
        tokenText: resolveToken("text"),
        tokenTextContrast: resolveToken("text-contrast"),
      };
    });

    expect(values.btnBg).toBe(values.tokenText);
    expect(values.btnFg).toBe(values.tokenTextContrast);
    expect(values.checkboxBg).toBe(values.tokenText);
    expect(values.switchBg).toBe(values.tokenText);
    expect(values.alertFg).toBe(values.tokenText);
    expect(values.badgeFg).toBe(values.tokenText);
    expect(values.progressBg).toBe(values.tokenText);
  });

  test("renders active progress bar with skeleton animation on pseudo-element", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const activeProgressStyles = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="progress-bar-active"]');
      if (!el) {
        throw new Error("Missing active progress bar fixture");
      }
      const beforeStyles = getComputedStyle(el, "::before");
      return {
        animationName: beforeStyles.animationName,
        display: beforeStyles.display,
        backgroundImage: beforeStyles.backgroundImage,
      };
    });

    expect(activeProgressStyles.animationName).toContain("anim-skeleton");
    expect(activeProgressStyles.display).toBe("block");
    expect(activeProgressStyles.backgroundImage).toContain("linear-gradient");
  });

  test("renders indeterminate progress bar with sliding animation", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const indeterminateProgressStyles = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="progress-bar-indeterminate"]');
      if (!el) {
        throw new Error("Missing indeterminate progress bar fixture");
      }
      const afterStyles = getComputedStyle(el, "::after");
      return {
        animationName: afterStyles.animationName,
        display: afterStyles.display,
        width: afterStyles.width,
      };
    });

    expect(indeterminateProgressStyles.animationName).toContain("anim-progress-indeterminate");
    expect(indeterminateProgressStyles.display).toBe("block");
    expect(indeterminateProgressStyles.width).not.toBe("0px");
  });
});
