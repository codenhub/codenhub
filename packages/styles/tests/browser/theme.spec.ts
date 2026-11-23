import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "./fixtures";
import { getColorDistance, getContrastRatio, ORIGIN, settleAnimations } from "./test-utils";

const COMPONENTS_URL = `${ORIGIN}/components/?env=vanilla`;

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
        dark: readTheme("theme-dark"),
        light: readTheme("theme-light"),
        unthemed: readTheme(""),
      };
    });

    expect(resolved.light.colorScheme).toBe("light");
    expect(resolved.dark.colorScheme).toBe("dark");

    expect(resolved.dark.text).not.toBe(resolved.light.text);
    expect(resolved.dark.background).not.toBe(resolved.light.background);

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
      outer.className = "theme-dark";
      const inner = document.createElement("section");
      inner.className = "theme-light";
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
     inherited from the page: `<aside class="theme-dark"><p>` on a light page kept the
     light theme's near-black and printed it on the region's dark ground. */
  test("re-resolves the text colour of a region a theme selector forces", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const resolved = await page.evaluate(() => {
      const root = document.documentElement;

      root.classList.remove("dark", "theme-dark");
      root.removeAttribute("data-theme");
      root.classList.add("theme-light");

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
        dark: read((host) => host.classList.add("theme-dark")),
        dataDark: read((host) => host.setAttribute("data-theme", "dark")),
        lightInDark: read((host) => {
          root.classList.replace("theme-light", "dark");
          host.classList.add("theme-light");
        }),
      };
    });

    for (const spelling of ["dark", "dataDark", "lightInDark"] as const) {
      expect(resolved[spelling].paragraph, `${spelling} region text`).toBe(resolved[spelling].token);
    }

    expect(resolved.dark.paragraph, "the region's text is not the page's").not.toBe(resolved.page);
    /* Each alias has to switch the region, not only agree with itself: a
       spelling that stopped matching left text and token on the page's ink
       together. */
    expect(resolved.dataDark.paragraph, "data-theme=dark is .theme-dark").toBe(resolved.dark.paragraph);
    expect(resolved.lightInDark.paragraph, ".theme-light inside a dark page is the light page").toBe(resolved.page);
  });

  /* `.light` and `.dark` are ordinary words for a class: a `<span
     class="light">` in a price on a dark page switched to the light scheme and
     printed its near-black text on the dark ground, at 1.00:1. `.dark` themes
     only the root, Tailwind's convention; `.light` is not a theme selector. */
  test("themes nothing with a bare light or dark class below the root", async ({ page }) => {
    await page.goto(COMPONENTS_URL);

    const resolved = await page.evaluate(() => {
      const root = document.documentElement;

      root.classList.remove("dark", "light", "theme-dark", "theme-light");
      root.setAttribute("data-theme", "dark");

      const read = (className: string) => {
        const span = document.createElement("span");

        span.className = className;
        document.body.append(span);
        const style = getComputedStyle(span);
        const values = { colorScheme: style.colorScheme, color: style.color };

        span.remove();

        return values;
      };

      const page = {
        colorScheme: getComputedStyle(document.body).colorScheme,
        color: getComputedStyle(document.body).color,
      };
      const light = read("light");

      root.removeAttribute("data-theme");
      root.classList.add("theme-light");
      const dark = read("dark");
      const lightPage = {
        colorScheme: getComputedStyle(document.body).colorScheme,
        color: getComputedStyle(document.body).color,
      };

      root.classList.replace("theme-light", "dark");
      const rootDark = getComputedStyle(document.body).colorScheme;

      return { page, light, lightPage, dark, rootDark };
    });

    expect(resolved.light, "a .light span on a dark page").toEqual(resolved.page);
    expect(resolved.dark, "a .dark span on a light page").toEqual(resolved.lightPage);
    expect(resolved.rootDark, ".dark on the root still themes the page").toBe("dark");
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
        '<section class="theme-dark"><p id="region">Region</p></section>' +
        '<button class="btn solid primary" id="button">Save</button></body></html>',
    );
    await page.addStyleTag({ url: `${ORIGIN}/shared/entry-vanilla.css` });
    await settleAnimations(page);

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

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/* `chs build` output for a page with one button, compiled once per worker. */
const chsBuild = (() => {
  let css: string | undefined;

  return () => {
    if (css === undefined) {
      const folder = mkdtempSync(path.join(tmpdir(), "chs-print-"));

      try {
        writeFileSync(path.join(folder, "index.html"), '<button class="btn solid primary">Save</button>');
        execFileSync(
          process.execPath,
          [path.join(packageRoot, "dist", "cli.js"), "build", "-c", "index.html", "-o", "app.css"],
          {
            cwd: folder,
            stdio: "pipe",
          },
        );
        css = readFileSync(path.join(folder, "app.css"), "utf8");
      } finally {
        rmSync(folder, { force: true, recursive: true });
      }
    }

    return css;
  };
})();

/* Every path a page takes the theme through: the compiled files, the
   Tailwind builds the dev server compiles, and `chs build`. */
const THEME_PATHS: { name: string; style: () => { content: string } | { url: string } }[] = [
  ...["index.css", "theme.css", "native.css", "components.css", "purge/index.css"].map((file) => ({
    name: `dist/${file}`,
    style: () => ({ content: readFileSync(path.join(packageRoot, "dist", file), "utf8") }),
  })),
  { name: "/tw", style: () => ({ url: `${ORIGIN}/shared/entry-tw.css` }) },
  { name: "/native/tw", style: () => ({ url: `${ORIGIN}/native/entry-tw.css` }) },
  { name: "chs build", style: () => ({ content: chsBuild() }) },
];

/* Every way a page asks for dark: the package's own selectors, an inline
   `color-scheme` as `@codenhub/theme` writes it, and a consumer's own rule,
   unlayered or in `utilities` as Tailwind's `scheme-dark` is. Each printed
   near-white on paper while it set the scheme with more weight than the
   theme layer's print rule had. */
const DARK_ROOTS = [
  { name: 'data-theme="dark"', html: 'data-theme="dark"', css: "" },
  { name: ".dark", html: 'class="dark"', css: "" },
  { name: ".theme-dark", html: 'class="theme-dark"', css: "" },
  { name: "inline color-scheme", html: 'data-theme="dark" style="color-scheme: dark"', css: "" },
  { name: "unlayered rule", html: "", css: ":root { color-scheme: dark; }" },
  { name: "utilities rule", html: "", css: "@layer utilities { :root { color-scheme: dark; } }" },
];

for (const themePath of THEME_PATHS) {
  test(`prints the light theme however the root asks for dark, ${themePath.name}`, async ({ page }) => {
    await page.emulateMedia({ media: "print" });

    const failures: string[] = [];

    for (const root of DARK_ROOTS) {
      // oxlint-disable-next-line no-await-in-loop -- one page per root, named in the failure.
      await page.setContent(
        `<!doctype html><html ${root.html}><head></head><body>` +
          '<span id="text" style="color: var(--color-text)">Text</span>' +
          '<section class="theme-dark"><span id="region" style="color: var(--color-text)">Region</span></section>' +
          '<div style="color-scheme: light"><span id="light" style="color: var(--color-text)">Light</span></div>' +
          "</body></html>",
      );
      // oxlint-disable-next-line no-await-in-loop -- as above.
      await page.addStyleTag(themePath.style());
      if (root.css) {
        // oxlint-disable-next-line no-await-in-loop -- as above.
        await page.addStyleTag({ content: root.css });
      }

      // oxlint-disable-next-line no-await-in-loop -- as above.
      const read = await page.evaluate(() => {
        const color = (id: string) => getComputedStyle(document.getElementById(id)!).color;

        return {
          light: color("light"),
          region: color("region"),
          scheme: getComputedStyle(document.documentElement).colorScheme,
          text: color("text"),
        };
      });

      if (read.scheme !== "light" || read.text !== read.light || read.region !== read.light) {
        failures.push(
          `${root.name}: scheme ${read.scheme}, text ${read.text}, region ${read.region}, light ${read.light}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
}

/* `.quote` hand-composes `box`'s formula rather than applying it, so it did not
   carry `box`'s exact print: a solid quotation printed its contrast text, white
   in the light theme, on paper with no plate behind it. */
test("prints a filled quotation with its plate", async ({ page }) => {
  await page.setContent(
    '<!doctype html><html data-theme="light"><body>' +
      '<blockquote class="quote solid primary" id="quote">Quoted</blockquote></body></html>',
  );
  await page.addStyleTag({ url: `${ORIGIN}/shared/entry-vanilla.css` });
  await page.emulateMedia({ media: "print" });
  await settleAnimations(page);

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

/* A token set on the page reaches a shadow root that loads the sheet too, as
   docs/setup.md asks: the tokens are declared on the page's `:root` alone and
   inherit into the shadow tree. Declared on `:host` as well, the shadow
   root's copy redeclared every colour token on the host, so a page's
   `--color-primary` stopped at the boundary while `--radius-control`, declared
   on `:root` only, crossed it. */
test("a page's token override reaches a shadow root that loads the sheet", async ({ page }) => {
  await page.setContent(
    `<!doctype html><html><head><link rel="stylesheet" href="${ORIGIN}/shared/entry-vanilla.css" /><style>:root { --color-primary: rgb(109, 40, 217); --radius-control: 3px; }</style></head><body><button class="btn solid primary" id="light">Go</button><div data-host></div></body></html>`,
  );
  await page.waitForLoadState("load");

  await page.evaluate(async (origin) => {
    const root = document.querySelector("[data-host]")!.attachShadow({ mode: "open" });
    const link = document.createElement("link");

    link.rel = "stylesheet";
    link.href = `${origin}/shared/entry-vanilla.css`;
    const loaded = new Promise((resolve) => link.addEventListener("load", resolve));

    root.append(link);
    await loaded;
    // After the sheet, or the button transitions from its unstyled face.
    root.append(Object.assign(document.createElement("button"), { className: "btn solid primary", textContent: "Go" }));
  }, ORIGIN);
  await settleAnimations(page);

  const read = await page.evaluate(() => {
    const inside = getComputedStyle(document.querySelector("[data-host]")!.shadowRoot!.querySelector(".btn")!);
    const outside = getComputedStyle(document.getElementById("light")!);

    return {
      inside: { background: inside.backgroundColor, radius: inside.borderTopLeftRadius },
      outside: { background: outside.backgroundColor, radius: outside.borderTopLeftRadius },
    };
  });

  expect(getColorDistance(read.outside.background, "rgb(109, 40, 217)"), "the page's own button").toBeLessThanOrEqual(
    2,
  );
  expect(
    getColorDistance(read.inside.background, read.outside.background),
    `in the shadow root ${read.inside.background}`,
  ).toBeLessThanOrEqual(2);
  expect(read.inside.radius, "the radius crosses too").toBe(read.outside.radius);
});

/* Tailwind's Preflight sets its own type on `html, :host`, and the reset puts
   the brand font back on `html` alone, so a shadow root took Tailwind's sans
   stack while the page beside it took `--font-default`. Inside a region that
   sets its own type, an aesthetic's font or a utility's leading, every other
   property of that rule stopped at the host too. Each one is read off the
   rule itself, so a property Preflight adds is checked without a list here
   growing. A value for each, distinct from Preflight's, is what the region
   sets; one without a value fails rather than going unchecked. */
const PREFLIGHT_HOST_VALUES: Record<string, string> = {
  "-webkit-tap-highlight-color": "rgb(255, 0, 0)",
  "-webkit-text-size-adjust": "50%",
  "text-size-adjust": "50%",
  "font-family": "monospace",
  "font-feature-settings": '"smcp"',
  "font-variation-settings": '"wght" 500',
  "line-height": "37px",
  "tab-size": "7",
};

const SHADOW_PATHS = THEME_PATHS.filter(({ name }) =>
  ["dist/index.css", "dist/purge/index.css", "/tw", "chs build"].includes(name),
);

test("Preflight's html, :host rule sets only properties this suite gives a value", async ({ page }) => {
  await page.setContent("<!doctype html><html><head></head><body></body></html>");
  await page.addStyleTag({ content: readFileSync(path.join(packageRoot, "dist", "index.css"), "utf8") });

  const properties = await page.evaluate(() => {
    const found: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule && rule.selectorText.replaceAll(" ", "") === "html,:host") {
          found.push(...Array.from(rule.style));
        }
        if ("cssRules" in rule && !(rule instanceof CSSStyleRule)) {
          walk((rule as CSSGroupingRule).cssRules);
        }
      }
    };

    for (const sheet of document.styleSheets) {
      walk(sheet.cssRules);
    }

    return found;
  });

  expect(properties.length, "the rule is found").toBeGreaterThan(0);
  expect(properties.filter((name) => !(name in PREFLIGHT_HOST_VALUES))).toEqual([]);
});

for (const themePath of SHADOW_PATHS) {
  test(`a shadow root takes the page's type, on the page and in a region, ${themePath.name}`, async ({ page }) => {
    const style = themePath.style();
    const region = Object.entries(PREFLIGHT_HOST_VALUES)
      .map(([name, value]) => `${name}: ${value}`)
      .join("; ");

    await page.setContent(
      `<!doctype html><html><head></head><body>` +
        '<span id="page-light">Text</span><div id="page-host"></div>' +
        `<div style='${region}'><span id="region-light">Text</span><div id="region-host"></div></div>` +
        "</body></html>",
    );
    await page.addStyleTag(style);

    const read = await page.evaluate(
      async ({ properties, style }) => {
        const results: Record<string, { light: string; shadow: string }> = {};

        for (const where of ["page", "region"]) {
          const root = document.getElementById(`${where}-host`)!.attachShadow({ mode: "open" });
          const sheet = document.createElement(style.url ? "link" : "style");

          if (style.url) {
            Object.assign(sheet, { href: style.url, rel: "stylesheet" });
          } else {
            sheet.textContent = style.content!;
          }
          const loaded = style.url ? new Promise((resolve) => sheet.addEventListener("load", resolve)) : null;

          root.append(sheet);
          // oxlint-disable-next-line no-await-in-loop -- each shadow root is read once its sheet applies.
          await loaded;
          const span = document.createElement("span");

          span.textContent = "Text";
          root.append(span);
          const light = getComputedStyle(document.getElementById(`${where}-light`)!);
          const shadow = getComputedStyle(span);

          for (const name of properties) {
            results[`${where} ${name}`] = {
              light: light.getPropertyValue(name),
              shadow: shadow.getPropertyValue(name),
            };
          }
        }

        return results;
      },
      { properties: Object.keys(PREFLIGHT_HOST_VALUES), style: style as { content?: string; url?: string } },
    );

    const differ = Object.entries(read)
      .filter(([, { light, shadow }]) => light !== shadow)
      .map(([name, { light, shadow }]) => `${name}: page ${light}, shadow ${shadow}`);

    expect(differ).toEqual([]);
  });
}

/* Inside a shadow root, the sheet's `:root` matches nothing, so the tokens
   reach it by inheritance from the page, which loads the sheet too, as
   docs/setup.md asks: a browser ignores `@property` in a shadow root, and
   without those registrations a card lost its line. */
test("styles components inside a shadow root", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setContent(
    `<!doctype html><html><head><link rel="stylesheet" href="${ORIGIN}/shared/entry-vanilla.css" /></head><body><div data-host></div></body></html>`,
  );
  await page.waitForLoadState("load");

  const read = await page.evaluate(async (origin) => {
    const root = document.querySelector("[data-host]")!.attachShadow({ mode: "open" });
    const link = document.createElement("link");

    link.rel = "stylesheet";
    link.href = `${origin}/shared/entry-vanilla.css`;
    const loaded = new Promise((resolve) => link.addEventListener("load", resolve));

    root.append(link);
    const body = document.createElement("div");

    body.innerHTML = '<div class="card raised">Card</div><button class="btn primary">Go</button>';
    root.append(body);
    await loaded;

    const card = getComputedStyle(root.querySelector(".card")!);
    const button = root.querySelector<HTMLButtonElement>(".btn")!;
    const host = getComputedStyle(root.host);

    return {
      colorScheme: host.colorScheme,
      intent: host.getPropertyValue("--intent-color").trim(),
      press: host.getPropertyValue("--ui-active-transform").trim(),
      cardLine: card.borderTopWidth,
      cardShadow: card.boxShadow,
      buttonHeight: getComputedStyle(button).minHeight,
    };
  }, ORIGIN);

  expect(read.colorScheme, "the host follows the system scheme").toBe("light dark");
  expect(read.intent, "the neutral intent").not.toBe("");
  expect(read.press, "the press").not.toBe("");
  expect(read.cardLine, "the card's line").not.toBe("0px");
  expect(read.cardShadow, "the card's depth").not.toBe("none");
  expect(read.buttonHeight, "the button's height").not.toBe("0px");

  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => {
    const button = document.querySelector("[data-host]")!.shadowRoot!.querySelector(".btn")!;

    return { focused: button.matches(":focus-visible"), outline: getComputedStyle(button).outlineStyle };
  });

  expect(ring.focused).toBe(true);
  expect(ring.outline, "the focus ring").not.toBe("none");
});

/* Selected text on a solid plate: the page's highlight is the brand colour,
   so on a `.solid.primary` button it painted primary on primary, and on the
   other intents it could land near the plate too. On a plate the highlight is
   the plate's own ink and the selected text the plate's colour, the pair the
   plate already prints its text in, inverted. */
for (const theme of ["light", "dark"] as const) {
  test(`selected text on every solid plate reads and stands out, ${theme} theme`, async ({ page }) => {
    const intents = ["neutral", "primary", "secondary", "success", "warning", "destructive", "info"];

    await page.setContent(
      `<!doctype html><html class="theme-${theme}"><head><link rel="stylesheet" href="${ORIGIN}/shared/entry-vanilla.css" /></head><body><p data-plate="page">Page</p>${intents
        .map(
          (intent) =>
            `<button class="btn solid ${intent}" data-plate="btn-${intent}">Go</button><span class="badge solid ${intent}" data-plate="badge-${intent}">New</span><div class="card solid ${intent}" data-plate="card-${intent}"><p data-text>Text</p></div>`,
        )
        .join("")}</body></html>`,
    );
    await page.waitForLoadState("load");
    await settleAnimations(page);

    const reads = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-plate]")].map((plate) => {
        const text = plate.querySelector<HTMLElement>("[data-text]") ?? plate;
        const selection = getComputedStyle(text, "::selection");

        return {
          name: plate.dataset.plate!,
          plate: getComputedStyle(plate.dataset.plate === "page" ? document.body : plate).backgroundColor,
          highlight: selection.backgroundColor,
          text: selection.color,
        };
      }),
    );

    for (const { name, plate, highlight, text } of reads) {
      const label = `${name}: ${text} on ${highlight} over ${plate}`;

      expect(getContrastRatio(text, highlight), label).toBeGreaterThanOrEqual(4.5);
      if (name !== "page") {
        expect(getContrastRatio(highlight, plate), label).toBeGreaterThanOrEqual(3);
      }
    }
  });
}
