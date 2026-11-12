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

  /* Setting only `color-scheme` left a region's own text on the ink it
     inherited from the page: `<aside class="dark"><p>` on a light page kept the
     light theme's near-black and printed it on the region's dark ground. */
  test("re-resolves the text colour of a region a theme selector forces", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const resolved = await page.evaluate(() => {
      const root = document.documentElement;

      root.classList.remove("dark", "theme-dark");
      root.removeAttribute("data-theme");
      root.classList.add("light");

      const read = (setup: (host: HTMLElement) => void) => {
        const host = document.createElement("aside");
        const paragraph = document.createElement("p");
        const probe = document.createElement("span");

        setup(host);
        probe.style.color = "var(--color-text)";
        host.append(paragraph, probe);
        document.body.append(host);

        const values = { paragraph: getComputedStyle(paragraph).color, token: getComputedStyle(probe).color };

        host.remove();

        return values;
      };

      return {
        page: getComputedStyle(document.body).color,
        dark: read((host) => host.classList.add("dark")),
        themeDark: read((host) => host.classList.add("theme-dark")),
        dataDark: read((host) => host.setAttribute("data-theme", "dark")),
        lightInDark: read((host) => {
          root.classList.replace("light", "dark");
          host.classList.add("light");
        }),
      };
    });

    for (const spelling of ["dark", "themeDark", "dataDark", "lightInDark"] as const) {
      expect(resolved[spelling].paragraph, `${spelling} region text`).toBe(resolved[spelling].token);
    }

    expect(resolved.dark.paragraph, "the region's text is not the page's").not.toBe(resolved.page);
    /* Each alias has to switch the region, not only agree with itself: a
       spelling that stopped matching left text and token on the page's ink
       together. */
    expect(resolved.themeDark.paragraph, ".theme-dark is .dark").toBe(resolved.dark.paragraph);
    expect(resolved.dataDark.paragraph, "data-theme=dark is .dark").toBe(resolved.dark.paragraph);
    expect(resolved.lightInDark.paragraph, ".light inside a dark page is the light page").toBe(resolved.page);
  });

  /* `--focus-ring` was resolved once at `:root`, so a container that set its
     own `--color-primary` filled a primary button with that colour and still
     ringed it in the page's. */
  test("draws the focus ring from the brand colour in scope, or a container's ring", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const readFocused = async (hostStyle: string) => {
      const expected = await page.evaluate((style) => {
        const host = document.createElement("div");
        const previous = document.createElement("button");
        const target = document.createElement("button");
        const probe = document.createElement("span");

        host.id = "focus-ring-host";
        host.setAttribute("style", style);
        previous.id = "focus-ring-previous";
        target.id = "focus-ring-target";
        target.className = "btn primary";
        target.textContent = "Probe";
        probe.style.color = "var(--focus-ring, color-mix(in srgb, var(--color-primary) 64%, transparent))";
        host.append(previous, target, probe);
        document.body.prepend(host);
        previous.focus();

        return getComputedStyle(probe).color;
      }, hostStyle);

      await page.keyboard.press("Tab");

      const focused = await page.evaluate(() => {
        const target = document.querySelector("#focus-ring-target")!;
        const values = {
          focusVisible: target.matches(":focus-visible"),
          outline: getComputedStyle(target).outlineColor,
        };

        document.querySelector("#focus-ring-host")!.remove();

        return values;
      });

      return { expected, ...focused };
    };

    const brand = await readFocused("--color-primary: rgb(255, 0, 0)");
    const ring = await readFocused("--focus-ring: rgb(0, 0, 255)");

    expect(brand.focusVisible).toBe(true);
    expect(brand.outline, "a scoped brand colour reaches the ring").toBe(brand.expected);
    expect(brand.outline).toBe("color(srgb 1 0 0 / 0.64)");
    expect(ring.outline, "a container's own ring still inherits").toBe("rgb(0, 0, 255)");
  });
});

/* Paper is white and a browser leaves backgrounds off it unless told
   otherwise. A dark page printed its near-white text on no ground, and a
   solid button its contrast label on no plate: both unreadable. */
test("prints a dark page in the light theme, and a filled box with its plate", async ({ page }) => {
  const read = async (theme: string) => {
    await page.setContent(
      `<!doctype html><html data-theme="${theme}"><body><p id="text">Text</p>` +
        '<section class="dark"><p id="region">Region</p></section>' +
        '<button class="btn solid primary" id="button">Save</button></body></html>',
    );
    await page.addStyleTag({ url: "http://localhost:5184/shared/entry-vanilla.css" });
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

    return page.evaluate(() => {
      const style = (id: string) => getComputedStyle(document.getElementById(id)!);

      return {
        adjust:
          style("button").getPropertyValue("print-color-adjust") ||
          style("button").getPropertyValue("-webkit-print-color-adjust"),
        plate: style("button").backgroundColor,
        region: style("region").color,
        text: style("text").color,
      };
    });
  };

  await page.emulateMedia({ media: "print" });

  const light = await read("light");
  const dark = await read("dark");

  expect(dark.text).toBe(light.text);
  expect(dark.region).toBe(light.text);
  expect(dark.adjust).toBe("exact");
  expect(dark.plate, "the solid button keeps a plate").not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
  expect(dark.plate, "the plate is the light theme's").toBe(light.plate);
});

/* `.quote` hand-composes `box`'s formula rather than applying it, so it did not
   carry `box`'s exact print: a solid quotation printed its contrast text, white
   in the light theme, on paper with no plate behind it. */
test("prints a filled quotation with its plate", async ({ page }) => {
  await page.setContent(
    '<!doctype html><html data-theme="light"><body>' +
      '<blockquote class="quote solid primary" id="quote">Quoted</blockquote></body></html>',
  );
  await page.addStyleTag({ url: "http://localhost:5184/shared/entry-vanilla.css" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

  const quote = await page.evaluate(() => {
    const style = getComputedStyle(document.getElementById("quote")!);

    return {
      adjust: style.getPropertyValue("print-color-adjust") || style.getPropertyValue("-webkit-print-color-adjust"),
      plate: style.backgroundColor,
    };
  });

  expect(quote.plate, "the solid quotation has a plate").not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
  expect(quote.adjust).toBe("exact");
});
