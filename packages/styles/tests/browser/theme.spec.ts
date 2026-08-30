import { expect, test } from "./fixtures";

const COMPONENTS_URL = "http://localhost:5184/components/?env=vanilla";

test.describe("theme", () => {
  test("exposes foundation tokens", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const tokenValues = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);

      return {
        containerMax: styles.getPropertyValue("--container-max").trim(),
        controlHeight: styles.getPropertyValue("--control-height").trim(),
        focusRing: styles.getPropertyValue("--focus-ring").trim(),
        motionDurationFast: styles.getPropertyValue("--motion-duration-fast").trim(),
        motionDurationNormal: styles.getPropertyValue("--motion-duration-normal").trim(),
        radiusControl: styles.getPropertyValue("--radius-control").trim(),
        elevationNone: styles.getPropertyValue("--elevation-none").trim(),
        elevationSm: styles.getPropertyValue("--elevation-sm").trim(),
        elevationMd: styles.getPropertyValue("--elevation-md").trim(),
        elevationLg: styles.getPropertyValue("--elevation-lg").trim(),
        layoutGap: styles.getPropertyValue("--layout-gap").trim(),
      };
    });

    expect(tokenValues.containerMax).not.toBe("");
    expect(tokenValues.controlHeight).not.toBe("");
    expect(tokenValues.focusRing).not.toBe("");
    expect(tokenValues.motionDurationFast).not.toBe("");
    expect(tokenValues.motionDurationNormal).not.toBe("");
    expect(tokenValues.radiusControl).not.toBe("");
    expect(tokenValues.elevationNone).not.toBe("");
    expect(tokenValues.elevationSm).not.toBe("");
    expect(tokenValues.elevationMd).not.toBe("");
    expect(tokenValues.elevationLg).not.toBe("");
    expect(tokenValues.layoutGap).not.toBe("");
  });

  test("exposes semantic hover color tokens", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

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

  /* Token values are declared once with `light-dark()` and selected by
     `color-scheme`, so these assert the selection itself rather than a specific
     palette. A test that reads each host's own tokens would pass even if theme
     selection stopped working entirely. */
  test("resolves distinct palettes for every theme selector", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const resolved = await page.evaluate(() => {
      const readTheme = (className: string) => {
        const host = document.createElement("section");
        host.className = className;
        const probe = document.createElement("span");
        host.append(probe);
        document.body.append(host);

        probe.style.color = "var(--color-text)";
        probe.style.backgroundColor = "var(--color-background)";

        const styles = getComputedStyle(probe);
        const values = {
          background: styles.backgroundColor,
          colorScheme: styles.colorScheme,
          text: styles.color,
        };

        host.remove();

        return values;
      };

      return {
        dark: readTheme("dark"),
        dataDark: readTheme("theme-dark"),
        light: readTheme("light"),
        unthemed: readTheme(""),
      };
    });

    expect(resolved.light.colorScheme).toBe("light");
    expect(resolved.dark.colorScheme).toBe("dark");

    expect(resolved.dark.text).not.toBe(resolved.light.text);
    expect(resolved.dark.background).not.toBe(resolved.light.background);

    // Aliases must land on exactly the same palette as the canonical selector.
    expect(resolved.dataDark.text).toBe(resolved.dark.text);

    // With no selector, the root follows the system preference.
    expect(resolved.unthemed.text).toBe(resolved.light.text);
  });

  test("follows the system preference with no explicit theme selector", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    /* The playground always writes an explicit theme class on the root, so the
       system-preference path is only observable once those are removed. */
    await page.evaluate(() => {
      document.documentElement.classList.remove("dark", "light", "theme-dark", "theme-light");
      document.documentElement.removeAttribute("data-theme");
    });

    const readRoot = () => {
      const styles = getComputedStyle(document.body);

      return { background: styles.backgroundColor, colorScheme: styles.colorScheme, text: styles.color };
    };

    await page.emulateMedia({ colorScheme: "dark" });
    const systemDark = await page.evaluate(readRoot);

    await page.emulateMedia({ colorScheme: "light" });
    const systemLight = await page.evaluate(readRoot);

    expect(systemDark.text).not.toBe(systemLight.text);
    expect(systemDark.background).not.toBe(systemLight.background);
  });

  test("lets a nested selector override an inherited theme", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const nested = await page.evaluate(() => {
      const outer = document.createElement("section");
      outer.className = "dark";
      const inner = document.createElement("section");
      inner.className = "light";
      const darkProbe = document.createElement("span");
      const lightProbe = document.createElement("span");

      outer.append(darkProbe, inner);
      inner.append(lightProbe);
      document.body.append(outer);

      const values = {
        inner: getComputedStyle(lightProbe).colorScheme,
        outer: getComputedStyle(darkProbe).colorScheme,
      };

      outer.remove();

      return values;
    });

    expect(nested.outer).toBe("dark");
    expect(nested.inner).toBe("light");
  });
});
