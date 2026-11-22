import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { getColorDistance, ORIGIN } from "./test-utils";

/* `docs/internal/generated-palette.md`'s whole premise is that `./palette`'s
   values are provably identical to what the package's components render,
   because they are read from a real browser rather than retyped by a person.
   This is that proof, run as a standing test rather than a one-off: every
   generated cell is checked against freshly rendered live components -- every
   component the docs map to that cell's ground, not just the one
   `scripts/generate-palette.mjs` probed -- through the same `getColorDistance`
   contract the rest of this suite already trusts. A component or `box.css`
   change nobody regenerated the palette for fails here, and so does a
   component that stops rendering the ground the docs map it to. The three
   flat neutral tokens (`docs/internal/generated-palette.md#flat-neutral-values`)
   get the same live-vs-generated check below, just without the component
   probe/hover apparatus, since they carry no intent, presentation, or hover
   state of their own. */

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const registry = JSON.parse(await readFile(path.join(packageRoot, "registry.json"), "utf8")) as {
  components: { class: string; default?: { ground?: string } }[];
  intents: Record<string, unknown>;
};
const INTENTS = Object.keys(registry.intents);
/* The components each ground describes, as `docs/usage/customizing.md`
   maps them. The generator probes the first of each; the rest have to agree. */
const GROUNDS = [
  { suffix: "", components: ["badge", "btn"] },
  { suffix: "page", components: ["alert"] },
  { suffix: "subtle", components: ["kbd", "code", "pre", "tooltip-icon"] },
] as const;
const ALL_COMPONENTS = GROUNDS.flatMap((ground) => ground.components);

/* The plates a neutral `.soft` draws that the palette does not describe.
   `.kbd`, `.code`, and `.pre` drop the neutral 12% wash so their resting plate
   stays quiet, and the generator probes `.kbd`; `.tooltip-icon` rests at
   `.ghost` and keeps the wash when `.soft` asks for it. Its edge and every
   other cell match, and `docs/usage/customizing.md` says which one does not. */
const UNDESCRIBED = new Set(["tooltip-icon:neutral-soft-subtle bg", "tooltip-icon:neutral-soft-subtle bg-hover"]);

const SURFACES_URL = `${ORIGIN}/surfaces/?env=vanilla`;

interface Probe {
  classes: string;
  key: string;
  name: string;
  readsBg: boolean;
  readsFg: boolean;
}

/* One probe per cell and per component that cell describes. `readsBg` and
   `readsFg` are independent: `.solid` bakes both a `-fg` and a `-bg`/`-edge`
   pair from the same cell, where `.soft`/`.ghost` split them across two probes
   because their `-fg` does not vary by ground but their `-bg`/`-edge` does.
   Both ground-independent values -- `fg`, and every `.solid` slot -- are held
   on every mapped component, which is what makes publishing them once true.
   `box-hover` is added as the generator
   adds it, so a component without a hover of its own still has one to read. */
function buildProbes(): Probe[] {
  const probes: Probe[] = [];
  const probe = (component: string, name: string, classes: string, reads: Pick<Probe, "readsBg" | "readsFg">) =>
    probes.push({ classes: `${component} box-hover ${classes} edged`, key: `${component}:${name}`, name, ...reads });

  for (const intent of INTENTS) {
    for (const component of ALL_COMPONENTS) {
      probe(component, `${intent}-solid`, `${intent} solid`, { readsBg: true, readsFg: true });
    }
    for (const presentation of ["soft", "ghost"] as const) {
      for (const ground of GROUNDS) {
        const name = ground.suffix === "" ? `${intent}-${presentation}` : `${intent}-${presentation}-${ground.suffix}`;

        for (const component of ground.components) {
          probe(component, name, `${intent} ${presentation}`, { readsBg: true, readsFg: true });
        }
      }
    }
  }

  return probes;
}

/* The fg of a ground-qualified cell is published once, on the unqualified name. */
const fgName = (name: string) => name.replace(/-(page|subtle)$/, "");

test("the subtle ground covers every component the registry grounds on --intent-subtle", () => {
  const onSubtle = registry.components
    .filter((component) => component.default?.ground === "--intent-subtle")
    .map((component) => component.class);

  expect([...onSubtle].sort()).toEqual([...GROUNDS[2].components].sort());
});

test.describe("generated palette", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SURFACES_URL);

    const paletteCss = await readFile(path.join(packageRoot, "dist", "palette.css"), "utf8");
    await page.addStyleTag({ content: paletteCss });
    /* No transition runs, as in `scripts/generate-palette.mjs`: `box` fades
       its fill and line on hover, reduced motion keeps colour fades, and a
       read taken mid-fade lands on an eased frame (codenhub/codenhub#605). */
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
  });

  for (const theme of ["light", "dark"] as const) {
    test(`matches every live composed value in ${theme} theme`, async ({ page }) => {
      if (theme === "dark") {
        await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      }

      const probes = buildProbes();

      const rest = await page.evaluate((probeList) => {
        const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
        const values: Record<string, { bg: string; bgHover?: string; edge: string; edgeHover?: string; fg: string }> =
          {};

        for (const probe of probeList) {
          const element = document.createElement("div");
          element.className = probe.classes;
          element.dataset.key = probe.key;
          host.append(element);

          const styles = getComputedStyle(element);
          values[probe.key] = { bg: styles.backgroundColor, edge: styles.borderTopColor, fg: styles.color };
        }

        return values;
      }, probes);

      /* oxlint-disable no-await-in-loop -- one page, hovered in turn: a real
         :hover, one element at a time, as a person's cursor triggers it. */
      for (const probe of probes.filter((entry) => entry.readsBg)) {
        const element = page.locator(`[data-key="${probe.key}"]`);

        await element.hover();
        // With no transition, the value is final once the element matches `:hover`.
        const hovered = await element.evaluate((node) => {
          if (!node.matches(":hover")) {
            throw new Error(`${(node as HTMLElement).dataset.key} is not hovered after hover().`);
          }
          const styles = getComputedStyle(node);
          return { bg: styles.backgroundColor, edge: styles.borderTopColor };
        });

        rest[probe.key].bgHover = hovered.bg;
        rest[probe.key].edgeHover = hovered.edge;
      }

      const generated = await page.evaluate(
        (probeList) => {
          const read = (token: string) => {
            const probe = document.createElement("span");
            probe.style.color = `var(${token})`;
            document.body.append(probe);
            const value = getComputedStyle(probe).color;
            probe.remove();
            return value;
          };
          const values: Record<
            string,
            { bg?: string; bgHover?: string; edge?: string; edgeHover?: string; fg?: string }
          > = {};

          for (const probe of probeList) {
            const bgSlots = probe.readsBg
              ? {
                  bg: read(`--palette-${probe.name}-bg`),
                  edge: read(`--palette-${probe.name}-edge`),
                  bgHover: read(`--palette-${probe.name}-bg-hover`),
                  edgeHover: read(`--palette-${probe.name}-edge-hover`),
                }
              : {};
            const fgSlots = probe.readsFg ? { fg: read(`--palette-${probe.fgName}-fg`) } : {};

            values[probe.key] = { ...bgSlots, ...fgSlots };
          }

          return values;
        },
        probes.map((probe) => ({ ...probe, fgName: fgName(probe.name) })),
      );

      const neutral = await page.evaluate(() => {
        const read = (token: string) => {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        };

        return {
          border: { generated: read("--palette-border"), live: read("--color-border") },
          surface: { generated: read("--palette-surface"), live: read("--color-surface") },
          text: { generated: read("--palette-text"), live: read("--color-text") },
        };
      });

      const mismatches: string[] = [];

      for (const [name, { generated: expected, live }] of Object.entries(neutral)) {
        if (getColorDistance(live, expected) > 2) {
          mismatches.push(`${name}: live ${live} vs generated ${expected}`);
        }
      }

      for (const probe of probes) {
        const live = rest[probe.key];
        const expected = generated[probe.key];
        const checks: [string, string | undefined, string | undefined][] = [];

        if (probe.readsBg) {
          checks.push(
            [`${probe.key} bg`, live.bg, expected.bg],
            [`${probe.key} edge`, live.edge, expected.edge],
            [`${probe.key} bg-hover`, live.bgHover, expected.bgHover],
            [`${probe.key} edge-hover`, live.edgeHover, expected.edgeHover],
          );
        }
        if (probe.readsFg) {
          checks.push([`${probe.key} fg`, live.fg, expected.fg]);
        }

        for (const [label, actual, wanted] of checks.filter(([label]) => !UNDESCRIBED.has(label))) {
          if (actual === undefined || wanted === undefined || getColorDistance(actual, wanted) > 2) {
            mismatches.push(`${label}: live ${actual} vs generated ${wanted}`);
          }
        }
      }

      expect(mismatches).toEqual([]);
    });
  }

  /* Each value is a `light-dark()` pair, so it follows `color-scheme` as the
     package's own tokens do: the nearest explicit theme wins at any depth, and
     with no theme selector the system's setting decides. Read through a
     colour, since the custom property itself holds the unresolved pair. */
  test("follows the nearest explicit theme, nested either way", async ({ page }) => {
    const values = await page.evaluate(() => {
      const read = (element: Element) => {
        const probe = document.createElement("span");

        probe.style.color = "var(--palette-text)";
        element.append(probe);
        const value = getComputedStyle(probe).color;

        probe.remove();

        return value;
      };
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div data-theme="dark" id="outer"><div class="theme-light" id="light"><div class="theme-dark" id="dark"></div></div></div><div class="theme-light theme-dark" id="both"></div><div data-theme="light" id="plain"></div>',
      );

      return {
        both: read(document.getElementById("both")!),
        dark: read(document.getElementById("dark")!),
        light: read(document.getElementById("light")!),
        outer: read(document.getElementById("outer")!),
        plain: read(document.getElementById("plain")!),
      };
    });

    expect(values.outer).not.toBe(values.plain);
    expect(values.light, "light inside dark").toBe(values.plain);
    expect(values.dark, "dark inside light inside dark").toBe(values.outer);
    expect(values.both, "both classes on one element").toBe(values.outer);
  });

  /* The palette was light unless a theme selector said dark, so under a dark
     system setting a consumer's toast took the light `neutral-solid-bg` while
     the page's `.badge.solid` rendered dark. */
  test("follows the system's dark setting with no theme selector", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    const values = await page.evaluate(() => {
      const root = document.documentElement;

      root.classList.remove("dark", "theme-dark", "theme-light");
      root.removeAttribute("data-theme");
      const badge = document.createElement("span");
      const probe = document.createElement("span");

      badge.className = "badge solid";
      badge.textContent = "Badge";
      probe.style.color = "var(--palette-neutral-solid-bg)";
      document.body.append(badge, probe);

      return {
        scheme: getComputedStyle(root).colorScheme,
        live: getComputedStyle(badge).backgroundColor,
        generated: getComputedStyle(probe).color,
      };
    });

    expect(values.scheme, "the page follows the system").toBe("light dark");
    expect(
      getColorDistance(values.live, values.generated),
      `live ${values.live} vs generated ${values.generated}`,
    ).toBeLessThanOrEqual(2);
  });
});

/* The theme selectors the package's own stylesheet sets one `color-scheme`
   on, read off its CSSOM rather than retyped: every style rule outside a
   media query whose `color-scheme` is a single keyword. `/palette` alone has
   to answer the same selectors, or a page that loads only the palette, as a
   library that lists the package as an optional peer does, kept the light
   values under `data-theme="dark"` (0.10.0 had a dark block; 0.11.0 dropped
   it). */
const themeSelectors = async (page: Page) => {
  const css = await readFile(path.join(packageRoot, "dist", "index.css"), "utf8");

  await page.setContent("<!doctype html><html><head></head><body></body></html>");
  await page.addStyleTag({ content: css });

  return page.evaluate(() => {
    const found: { scheme: string; selector: string }[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
          continue;
        }
        if (rule instanceof CSSStyleRule) {
          const scheme = rule.style.getPropertyValue("color-scheme").trim();

          if (scheme === "light" || scheme === "dark") {
            for (const selector of rule.selectorText.split(",")) {
              found.push({ scheme, selector: selector.trim() });
            }
          }
        }
        if ("cssRules" in rule) {
          walk((rule as CSSGroupingRule).cssRules);
        }
      }
    };

    for (const sheet of document.styleSheets) {
      walk(sheet.cssRules);
    }

    return found;
  });
};

test.describe("/palette alone", () => {
  test("follows every theme selector the package sets, both themes", async ({ page }) => {
    const selectors = await themeSelectors(page);

    expect(new Set(selectors.map(({ scheme }) => scheme)), "a selector for each theme").toEqual(
      new Set(["dark", "light"]),
    );

    const paletteCss = await readFile(path.join(packageRoot, "dist", "palette.css"), "utf8");
    const results: string[] = [];

    for (const { scheme, selector } of selectors) {
      await page.setContent("<!doctype html><html><head></head><body></body></html>");
      await page.addStyleTag({ content: paletteCss });

      // oxlint-disable-next-line no-await-in-loop -- one fresh page per selector.
      const read = await page.evaluate(
        ({ scheme, selector }) => {
          const onRoot = selector.startsWith(":root");
          const compound = onRoot ? selector.slice(":root".length) : selector;
          /* A light selector sits under an inline dark scheme, so following it
             is visible; a dark one sits on the light default. */
          const wrapper = document.createElement("div");

          wrapper.style.colorScheme = scheme === "light" ? "dark" : "light";
          document.body.append(wrapper);
          const target = onRoot ? document.documentElement : wrapper.appendChild(document.createElement("div"));

          for (const [, name] of compound.matchAll(/\.([\w-]+)/g)) {
            target.classList.add(name!);
          }
          for (const [, name, value] of compound.matchAll(/\[([\w-]+)="([^"]*)"\]/g)) {
            target.setAttribute(name!, value!);
          }
          if (!target.matches(selector)) {
            throw new Error(`could not build an element for ${selector}`);
          }

          const probe = (parent: Element, colorScheme?: string) => {
            const span = document.createElement("span");

            if (colorScheme) {
              span.style.colorScheme = colorScheme;
            }
            span.style.color = "var(--palette-text)";
            parent.append(span);
            return getComputedStyle(span).color;
          };

          return {
            actual: probe(onRoot ? document.body : target),
            expected: probe(document.body, scheme),
            other: probe(document.body, scheme === "light" ? "dark" : "light"),
          };
        },
        { scheme, selector },
      );

      expect(read.expected, "the two themes differ").not.toBe(read.other);
      if (read.actual !== read.expected) {
        results.push(`${selector}: ${read.actual}, wanted the ${scheme} ${read.expected}`);
      }
    }

    expect(results).toEqual([]);
  });

  /* Paper is the light ground for a palette-only page too, however the root
     asks for dark: `@codenhub/theme` writes `color-scheme` inline. */
  test("prints the light values", async ({ page }) => {
    const paletteCss = await readFile(path.join(packageRoot, "dist", "palette.css"), "utf8");

    await page.emulateMedia({ media: "print" });
    await page.setContent(
      '<!doctype html><html data-theme="dark" style="color-scheme: dark"><head></head><body>' +
        '<span id="root" style="color: var(--palette-text)">.</span>' +
        '<section class="theme-dark"><span id="region" style="color: var(--palette-text)">.</span></section>' +
        '<div style="color-scheme: light"><span id="light" style="color: var(--palette-text)">.</span></div>' +
        "</body></html>",
    );
    await page.addStyleTag({ content: paletteCss });

    const read = await page.evaluate(() =>
      Object.fromEntries(
        ["root", "region", "light"].map((id) => [id, getComputedStyle(document.getElementById(id)!).color]),
      ),
    );

    expect(read.root).toBe(read.light);
    expect(read.region).toBe(read.light);
  });

  /* Only the theme selectors: on a bare `:root` it would decide for a page
     that loads the palette beside its own scheme. Following the system takes
     `color-scheme: light dark` on the root, which the page sets. */
  test("leaves the root's color-scheme to the page", async ({ page }) => {
    const paletteCss = await readFile(path.join(packageRoot, "dist", "palette.css"), "utf8");

    await page.emulateMedia({ colorScheme: "dark" });
    await page.setContent("<!doctype html><html><head></head><body></body></html>");
    await page.addStyleTag({ content: paletteCss });

    const read = await page.evaluate(() => {
      const probe = (colorScheme: string) => {
        const span = document.createElement("span");

        span.style.colorScheme = colorScheme;
        span.style.color = "var(--palette-text)";
        document.body.append(span);
        return getComputedStyle(span).color;
      };
      const scheme = getComputedStyle(document.documentElement).colorScheme;
      const light = probe("light");
      const dark = probe("dark");

      document.documentElement.style.colorScheme = "light dark";
      const followed = probe("");

      return { dark, followed, light, scheme };
    });

    expect(read.scheme).toBe("normal");
    expect(read.followed, "light dark on the root follows the system").toBe(read.dark);
  });
});
