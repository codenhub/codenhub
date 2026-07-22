import { expect, test } from "@playwright/test";

const COMPONENTS_URL = "http://localhost:5184/components/?env=vanilla";
const NATIVE_URL = "http://localhost:5184/native/?env=vanilla";
const COMPONENT_STYLES_URL = "http://localhost:5184/components/entry-components.css";
const NATIVE_STYLES_URL = "http://localhost:5184/native/entry-vanilla.css";
const CONTROL_CLASSES = ["control-base", "ipt", "textarea", "select", "checkbox", "radio", "switch"] as const;
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
  await expect(labels).toHaveCount(14);
  expect(
    await labels.evaluateAll((elements) =>
      elements.every((label) => label instanceof HTMLLabelElement && label.control === label.nextElementSibling),
    ),
  ).toBe(true);
});

test("gives every loader fixture a unique ID matching its variant", async ({ page }) => {
  await page.goto(COMPONENTS_URL);

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
  await page.goto(COMPONENTS_URL);

  const tooltips = page.locator(".tooltip-icon");
  await expect(tooltips).toHaveCount(5);
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
  await page.goto(COMPONENTS_URL);

  const progressBars = page.getByRole("progressbar");
  await expect(progressBars).toHaveCount(10);

  await expect(page.getByTestId("progress-bar")).toHaveAttribute("aria-valuenow", "64");
  await expect(page.getByTestId("progress-bar-active")).toHaveAttribute("aria-valuenow", "64");
  await expect(page.getByTestId("progress-bar-primary")).toHaveAttribute("aria-valuenow", "50");
  await expect(page.getByTestId("progress-bar-secondary")).toHaveAttribute("aria-valuenow", "80");
  await expect(page.getByTestId("progress-bar-success")).toHaveAttribute("aria-valuenow", "40");
  await expect(page.getByTestId("progress-bar-success-active")).toHaveAttribute("aria-valuenow", "40");
  await expect(page.getByTestId("progress-bar-warning")).toHaveAttribute("aria-valuenow", "75");
  await expect(page.getByTestId("progress-bar-destructive")).toHaveAttribute("aria-valuenow", "90");
  await expect(page.getByTestId("progress-bar-info")).toHaveAttribute("aria-valuenow", "30");

  const progressRanges = await progressBars.evaluateAll((elements) =>
    elements.map((progressBar) => ({
      maximum: progressBar.getAttribute("aria-valuemax"),
      minimum: progressBar.getAttribute("aria-valuemin"),
    })),
  );
  for (const range of progressRanges) {
    expect(range.minimum).toBe("0");
    expect(range.maximum).toBe("100");
  }

  await expect(page.getByTestId("progress-bar-indeterminate")).not.toHaveAttribute("aria-valuenow");
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

test("keeps the select arrow themed for every dark-mode path while light override wins", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(COMPONENTS_URL);

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

test("stops every loader variant under reduced motion with the component-only stylesheet", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: COMPONENT_STYLES_URL });

  const reducedStyles = await page.evaluate(
    (variants) =>
      variants.map((variant) => {
        const loader = document.createElement("span");
        loader.className = variant === "loader" ? "loader" : `loader ${variant}`;
        document.body.append(loader);
        const styles = getComputedStyle(loader);
        const result = {
          animationName: styles.animationName,
          image: styles.getPropertyValue("--ai-image"),
          variant,
        };
        loader.remove();
        return result;
      }),
    LOADER_VARIANTS,
  );

  for (const styles of reducedStyles) {
    expect(styles.image, styles.variant).not.toContain("animation");
    expect(styles.animationName, styles.variant).toBe("none");
  }

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: COMPONENT_STYLES_URL });
  const animatedImages = await page.evaluate(
    (variants) =>
      variants.map((variant) => {
        const loader = document.createElement("span");
        loader.className = variant === "loader" ? "loader" : `loader ${variant}`;
        document.body.append(loader);
        const image = getComputedStyle(loader).getPropertyValue("--ai-image");
        loader.remove();
        return { image, variant };
      }),
    LOADER_VARIANTS,
  );

  for (const styles of animatedImages) {
    expect(styles.image, styles.variant).toContain("animation");
  }
});

test("allows document-level horizontal overflow instead of clipping it", async ({ page }) => {
  await page.goto(COMPONENTS_URL);

  const overflow = await page.evaluate(() => ({
    body: getComputedStyle(document.body).overflowX,
    html: getComputedStyle(document.documentElement).overflowX,
  }));

  expect(overflow.html).not.toMatch(/hidden|clip/);
  expect(overflow.body).not.toMatch(/hidden|clip/);
});
