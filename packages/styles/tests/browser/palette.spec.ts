import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

  /* The nearest explicit theme wins, as it does for the package's own tokens:
     a light subtree inside a dark one reads the light values, a dark one
     inside it the dark values again, and dark wins on an element carrying
     both, as `color-scheme` does. A bare `.dark` themes only the root, as in
     `theme.css`. */
  test("follows the nearest explicit theme, nested either way", async ({ page }) => {
    const values = await page.evaluate(() => {
      const read = (element: Element) => getComputedStyle(element).getPropertyValue("--palette-text").trim();
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div data-theme="dark" id="outer"><div class="theme-light" id="light"><div class="theme-dark" id="dark"></div></div></div><div class="theme-light theme-dark" id="both"></div><div class="dark" id="bare"></div>',
      );

      return {
        bare: read(document.getElementById("bare")!),
        both: read(document.getElementById("both")!),
        dark: read(document.getElementById("dark")!),
        light: read(document.getElementById("light")!),
        outer: read(document.getElementById("outer")!),
        root: read(document.documentElement),
      };
    });

    expect(values.outer).not.toBe(values.root);
    expect(values.light, "light inside dark").toBe(values.root);
    expect(values.dark, "dark inside light inside dark").toBe(values.outer);
    expect(values.both, "both classes on one element").toBe(values.outer);
    expect(values.bare, "a bare .dark off the root").toBe(values.root);
  });

  /* With no theme selector the package follows the system, so under a dark
     system setting the palette reads dark too: a consumer's chip took the
     light `neutral-solid-bg` beside the page's dark `.badge.solid`. A root
     forced light keeps the light values. Read with `getPropertyValue`, which
     returns the colour itself, as a script reading the palette expects. */
  test("follows the system's dark setting with no theme selector", async ({ page }) => {
    const root = () => getComputedStyle(document.documentElement).getPropertyValue("--palette-neutral-solid-bg").trim();
    const light = await page.evaluate(root);

    await page.emulateMedia({ colorScheme: "dark" });

    const values = await page.evaluate(() => {
      const element = document.documentElement;

      element.classList.remove("dark", "theme-dark", "theme-light");
      element.removeAttribute("data-theme");
      const badge = document.createElement("span");
      const probe = document.createElement("span");

      badge.className = "badge solid";
      badge.textContent = "Badge";
      probe.style.color = "var(--palette-neutral-solid-bg)";
      document.body.append(badge, probe);
      const raw = getComputedStyle(element).getPropertyValue("--palette-neutral-solid-bg").trim();

      element.setAttribute("data-theme", "light");
      const forced = getComputedStyle(element).getPropertyValue("--palette-neutral-solid-bg").trim();

      element.removeAttribute("data-theme");

      return {
        scheme: getComputedStyle(element).colorScheme,
        live: getComputedStyle(badge).backgroundColor,
        generated: getComputedStyle(probe).color,
        raw,
        forced,
      };
    });

    expect(values.scheme, "the page follows the system").toBe("light dark");
    expect(values.raw, "a plain colour").not.toContain("light-dark");
    expect(
      getColorDistance(values.live, values.generated),
      `live ${values.live} vs generated ${values.generated}`,
    ).toBeLessThanOrEqual(2);
    expect(values.forced, 'data-theme="light" under a dark system').toBe(light);
  });

  /* Print is light, as `theme.css`'s print rule makes the package's own
     tokens, so a printed dark region does not put near-white palette text on
     paper. Every selector that reads dark on screen, the system setting's
     included, reads the light values again. */
  test("prints the light values under every dark selector", async ({ page }) => {
    const root = () => getComputedStyle(document.documentElement).getPropertyValue("--palette-text").trim();
    const light = await page.evaluate(root);

    await page.emulateMedia({ colorScheme: "dark", media: "print" });

    const values = await page.evaluate(() => {
      const element = document.documentElement;
      const read = (target: Element) => getComputedStyle(target).getPropertyValue("--palette-text").trim();

      element.classList.remove("dark", "theme-dark", "theme-light");
      element.removeAttribute("data-theme");
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="theme-dark" id="class"></div><div data-theme="dark" id="attribute"></div>',
      );
      const system = read(element);

      element.classList.add("dark");
      const rootDark = read(element);

      element.classList.remove("dark");

      return {
        attribute: read(document.getElementById("attribute")!),
        class: read(document.getElementById("class")!),
        rootDark,
        system,
      };
    });

    expect(values.system, "a dark system setting").toBe(light);
    expect(values.rootDark, ":root.dark").toBe(light);
    expect(values.class, ".theme-dark").toBe(light);
    expect(values.attribute, '[data-theme="dark"]').toBe(light);
  });
});
