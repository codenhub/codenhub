import { expect, test } from "@playwright/test";

const FEEDBACK_URL = "http://localhost:5184/feedback/?env=vanilla";
const NATIVE_URL = "http://localhost:5184/native/?env=vanilla";
const COMPONENT_STYLES_URL = "http://localhost:5184/shared/entry-components.css";
const NATIVE_STYLES_URL = "http://localhost:5184/native/entry-vanilla.css";
const CONTROL_CLASSES = ["ipt", "textarea", "select", "checkbox", "radio", "switch"] as const;
const LOADER_VARIANTS = [
  "loader",
  "dots-wave",
  "dots-fade",
  "dots-queue",
  "dots-rotate",
  "dots-grow",
  "dots-grow-alternate",
  "dot-bounce",
  "bars-wave",
  "pulse-ring",
] as const;

test("associates every native form label with its control", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const labels = page.locator(".native-label");
  await expect(labels).toHaveCount(16);
  expect(
    await labels.evaluateAll((elements) =>
      elements.every(
        (label) =>
          label instanceof HTMLLabelElement && label.control !== null && label.control === label.nextElementSibling,
      ),
    ),
  ).toBe(true);
});

test("gives every loader fixture a unique ID matching its variant", async ({ page }) => {
  await page.goto(FEEDBACK_URL);

  const expectedFixtures = [
    { className: "loader", testId: "loader-default" },
    { className: "dots-wave", testId: "loader-dots-wave" },
    { className: "dots-fade", testId: "loader-dots-fade" },
    { className: "dots-queue", testId: "loader-dots-queue" },
    { className: "dots-rotate", testId: "loader-dots-rotate" },
    { className: "dots-grow", testId: "loader-dots-grow" },
    { className: "dots-grow-alternate", testId: "loader-dots-grow-alternate" },
    { className: "dot-bounce", testId: "loader-dot-bounce" },
    { className: "bars-wave", testId: "loader-bars-wave" },
    { className: "pulse-ring", testId: "loader-pulse-ring" },
  ] as const;
  const loaderIds = await page
    .locator(".loader")
    .evaluateAll((loaders) => loaders.map((loader) => loader.getAttribute("data-testid")));

  expect(new Set(loaderIds).size).toBe(loaderIds.length);
  await Promise.all(
    expectedFixtures.map((fixture) =>
      expect(page.getByTestId(fixture.testId)).toHaveClass(new RegExp(`(^|\\s)${fixture.className}(\\s|$)`)),
    ),
  );
});

test("makes tooltip examples keyboard-focusable and accessibly named", async ({ page }) => {
  await page.goto(FEEDBACK_URL);

  const tooltips = page.locator(".tooltip-icon");
  await expect(tooltips.first()).toBeVisible();
  const tooltipAttributes = await tooltips.evaluateAll((elements) =>
    elements.map((tooltip) => ({
      accessibleName: tooltip.getAttribute("aria-label"),
      tooltipText: tooltip.getAttribute("data-tooltip"),
      tabIndex: tooltip.getAttribute("tabindex"),
    })),
  );

  for (const attributes of tooltipAttributes) {
    expect(attributes.tabIndex).toBe("0");
    expect(attributes.accessibleName).toBe(attributes.tooltipText);
  }
});

test("exposes determinate and indeterminate progress semantics", async ({ page }) => {
  await page.goto(FEEDBACK_URL);

  const progressBars = page.getByRole("progressbar");
  await expect(progressBars.first()).toBeVisible();

  await expect(page.getByTestId("progress-default-none")).toHaveAttribute("aria-valuenow", "60");
  await expect(page.getByTestId("progress-default-success-active")).toHaveAttribute("aria-valuenow", "60");

  const semantics = await progressBars.evaluateAll((elements) =>
    elements.map((progressBar) => ({
      determinate: !progressBar.classList.contains("indeterminate"),
      label: progressBar.getAttribute("aria-label"),
      maximum: progressBar.getAttribute("aria-valuemax"),
      minimum: progressBar.getAttribute("aria-valuemin"),
      value: progressBar.getAttribute("aria-valuenow"),
    })),
  );

  for (const bar of semantics) {
    expect(bar.minimum).toBe("0");
    expect(bar.maximum).toBe("100");
    expect(bar.label, "every progress bar is named").toBeTruthy();
    /* An indeterminate bar reports no value at all; reporting one would claim
       progress it cannot know. */
    if (bar.determinate) {
      expect(bar.value, bar.label ?? "").toBe("60");
    } else {
      expect(bar.value, bar.label ?? "").toBeNull();
    }
  }
});

test("uses visible system-color outlines for form controls in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: COMPONENT_STYLES_URL });

  const focusStyles = await page.evaluate((controlClasses) => {
    const expectedColorProbe = document.createElement("span");
    expectedColorProbe.style.color = "Highlight";
    document.body.append(expectedColorProbe);
    const expectedOutlineColor = getComputedStyle(expectedColorProbe).color;
    expectedColorProbe.remove();

    return controlClasses.map((className) => {
      const control = document.createElement(
        className === "textarea" ? "textarea" : className === "select" ? "select" : "input",
      );

      if (control instanceof HTMLInputElement && ["checkbox", "radio", "switch"].includes(className)) {
        control.type = className === "radio" ? "radio" : "checkbox";
      }

      control.className = className;
      document.body.append(control);
      control.focus();
      const styles = getComputedStyle(control);
      const result = {
        boxShadow: styles.boxShadow,
        className,
        expectedOutlineColor,
        isFocusVisible: control.matches(":focus-visible"),
        outlineColor: styles.outlineColor,
        outlineStyle: styles.outlineStyle,
        outlineWidth: styles.outlineWidth,
      };
      control.remove();
      return result;
    });
  }, CONTROL_CLASSES);

  for (const styles of focusStyles) {
    expect(styles.isFocusVisible, styles.className).toBe(true);
    expect(styles.outlineStyle, styles.className).toBe("solid");
    expect(Number.parseFloat(styles.outlineWidth), styles.className).toBeGreaterThanOrEqual(2);
    expect(styles.outlineColor, styles.className).toBe(styles.expectedOutlineColor);
    expect(styles.boxShadow, styles.className).toBe("none");
  }
});

test("uses visible system-color outlines for unclassed native controls in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: NATIVE_STYLES_URL });

  const focusStyles = await page.evaluate(() => {
    const expectedColorProbe = document.createElement("span");
    expectedColorProbe.style.color = "Highlight";
    document.body.append(expectedColorProbe);
    const expectedOutlineColor = getComputedStyle(expectedColorProbe).color;
    expectedColorProbe.remove();

    const controls = [
      Object.assign(document.createElement("input"), { type: "text" }),
      document.createElement("select"),
      document.createElement("textarea"),
      Object.assign(document.createElement("input"), { type: "checkbox" }),
      Object.assign(document.createElement("input"), { type: "radio" }),
    ];

    return controls.map((control) => {
      document.body.append(control);
      control.focus();
      const styles = getComputedStyle(control);
      const result = {
        control: control instanceof HTMLInputElement ? `input[type=${control.type}]` : control.localName,
        expectedOutlineColor,
        isFocusVisible: control.matches(":focus-visible"),
        outlineColor: styles.outlineColor,
        outlineStyle: styles.outlineStyle,
        outlineWidth: styles.outlineWidth,
      };
      control.remove();
      return result;
    });
  });

  for (const styles of focusStyles) {
    expect(styles.isFocusVisible, styles.control).toBe(true);
    expect(styles.outlineStyle, styles.control).toBe("solid");
    expect(Number.parseFloat(styles.outlineWidth), styles.control).toBeGreaterThanOrEqual(2);
    expect(styles.outlineColor, styles.control).toBe(styles.expectedOutlineColor);
  }
});

test("uses system colors to distinguish checked custom toggles in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });

  const expectSystemToggleColors = async (fixture: {
    checkboxClass: string;
    radioClass: string;
    stylesUrl: string;
  }) => {
    await page.setContent(`
      <!doctype html>
      <html>
        <body>
          <input class="${fixture.checkboxClass}" data-testid="checkbox" type="checkbox" checked>
          <input class="${fixture.checkboxClass}" data-testid="unchecked-checkbox" type="checkbox">
          <input class="${fixture.radioClass}" data-testid="radio" type="radio" checked>
          <input class="${fixture.radioClass}" data-testid="unchecked-radio" type="radio">
        </body>
      </html>
    `);
    await page.addStyleTag({ url: fixture.stylesUrl });

    const colors = await page.evaluate(() => {
      const resolveColor = (color: string) => {
        const probe = document.createElement("span");
        probe.style.color = color;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      };
      const checkbox = document.querySelector('[data-testid="checkbox"]')!;
      const uncheckedCheckbox = document.querySelector('[data-testid="unchecked-checkbox"]')!;
      const radio = document.querySelector('[data-testid="radio"]')!;
      const uncheckedRadio = document.querySelector('[data-testid="unchecked-radio"]')!;

      return {
        checkboxBackground: getComputedStyle(checkbox).backgroundColor,
        checkboxMark: getComputedStyle(checkbox, "::after").backgroundColor,
        expectedCanvas: resolveColor("Canvas"),
        expectedCanvasText: resolveColor("CanvasText"),
        expectedHighlight: resolveColor("Highlight"),
        expectedHighlightText: resolveColor("HighlightText"),
        radioBackground: getComputedStyle(radio).backgroundColor,
        radioBorder: getComputedStyle(radio).borderTopColor,
        radioMark: getComputedStyle(radio, "::after").backgroundColor,
        uncheckedCheckboxBackground: getComputedStyle(uncheckedCheckbox).backgroundColor,
        uncheckedCheckboxBorder: getComputedStyle(uncheckedCheckbox).borderTopColor,
        uncheckedRadioBackground: getComputedStyle(uncheckedRadio).backgroundColor,
        uncheckedRadioBorder: getComputedStyle(uncheckedRadio).borderTopColor,
      };
    });

    expect(colors.checkboxBackground).toBe(colors.expectedHighlight);
    expect(colors.checkboxMark).toBe(colors.expectedHighlightText);
    expect(colors.radioBackground).toBe(colors.expectedCanvas);
    expect(colors.radioBorder).toBe(colors.expectedHighlight);
    expect(colors.radioMark).toBe(colors.expectedHighlight);
    expect(colors.uncheckedCheckboxBackground).toBe(colors.expectedCanvas);
    expect(colors.uncheckedCheckboxBorder).toBe(colors.expectedCanvasText);
    expect(colors.uncheckedRadioBackground).toBe(colors.expectedCanvas);
    expect(colors.uncheckedRadioBorder).toBe(colors.expectedCanvasText);
  };

  await expectSystemToggleColors({
    checkboxClass: "checkbox",
    radioClass: "radio",
    stylesUrl: COMPONENT_STYLES_URL,
  });
  await expectSystemToggleColors({ checkboxClass: "", radioClass: "", stylesUrl: NATIVE_STYLES_URL });
});

test("keeps the select arrow themed for every dark-mode path while light override wins", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(FEEDBACK_URL);

  const explicitThemeImages = await page.evaluate(() => {
    const readArrowImage = ({ className = "", theme }: { className?: string; theme?: "dark" | "light" }) => {
      const select = document.createElement("select");
      select.className = `select ${className}`;
      if (theme) {
        select.dataset.theme = theme;
      }
      document.body.append(select);
      const image = getComputedStyle(select).backgroundImage;
      select.remove();
      return image;
    };

    return {
      dataDark: readArrowImage({ theme: "dark" }),
      light: readArrowImage({}),
      themeDark: readArrowImage({ className: "theme-dark" }),
    };
  });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  const systemThemeImages = await page.evaluate(() => {
    const readArrowImage = (theme?: "light") => {
      const select = document.createElement("select");
      select.className = "select";
      if (theme) {
        select.dataset.theme = theme;
      }
      document.body.append(select);
      const image = getComputedStyle(select).backgroundImage;
      select.remove();
      return image;
    };

    return {
      explicitLight: readArrowImage("light"),
      systemDark: readArrowImage(),
    };
  });

  expect(explicitThemeImages.light).not.toBe("none");
  expect(explicitThemeImages.themeDark).not.toBe(explicitThemeImages.light);
  expect(explicitThemeImages.dataDark).not.toBe(explicitThemeImages.light);
  expect(systemThemeImages.systemDark).not.toBe(explicitThemeImages.light);
  expect(systemThemeImages.explicitLight).toBe(explicitThemeImages.light);
});

/* The motion lives inside the artwork rather than in a CSS animation on the
   element, so `animation-name` says nothing about whether a loader moves. What
   reduced motion swaps is `--loader-art` itself, and the still artwork is the
   one with no `animation` declaration in its SVG. */
test("stops every loader variant under reduced motion with the component-only stylesheet", async ({ page }) => {
  const readArtwork = async () => {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addStyleTag({ url: COMPONENT_STYLES_URL });

    return page.evaluate(
      (variants) =>
        variants.map((variant) => {
          const loader = document.createElement("span");
          loader.className = variant === "loader" ? "loader" : `loader ${variant}`;
          document.body.append(loader);
          const art = getComputedStyle(loader).getPropertyValue("--loader-art");
          loader.remove();
          return { art, variant };
        }),
      LOADER_VARIANTS,
    );
  };

  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await readArtwork();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  const moving = await readArtwork();

  for (const [index, styles] of still.entries()) {
    expect(styles.art, styles.variant).not.toContain("animation");
    /* A variant whose still artwork equals its moving one was never stopped. */
    expect(styles.art, styles.variant).not.toBe(moving[index]!.art);
  }

  for (const styles of moving) {
    expect(styles.art, styles.variant).toContain("animation");
  }
});

test("allows document-level horizontal overflow instead of clipping it", async ({ page }) => {
  await page.goto(FEEDBACK_URL);

  const overflow = await page.evaluate(() => ({
    body: getComputedStyle(document.body).overflowX,
    html: getComputedStyle(document.documentElement).overflowX,
  }));

  expect(overflow.html).not.toMatch(/hidden|clip/);
  expect(overflow.body).not.toMatch(/hidden|clip/);
});
