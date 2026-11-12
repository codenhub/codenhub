import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "./fixtures";
import { getColorDistance } from "./test-utils";

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

const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";

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
    // `box` transitions `background-color`/`border-color` on hover, and
    // reading mid-transition is a flaky test waiting to happen -- the same
    // reason `scripts/generate-palette.mjs` sets this before it reads hover.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(SURFACES_URL);

    const paletteCss = await readFile(path.join(packageRoot, "dist", "palette.css"), "utf8");
    await page.addStyleTag({ content: paletteCss });
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
         :hover, one element at a time, matches how a person's cursor would
         trigger it, and each read has to settle before the next moves the
         mouse away from the probe it just read. */
      for (const probe of probes.filter((entry) => entry.readsBg)) {
        await page.locator(`[data-key="${probe.key}"]`).hover();
        /* `:hover` matches immediately, but `background-color: var(--_bg)` on
           `.box` does not visibly repaint to `.box-hover`'s new, winning
           `--_bg` until the browser's next style flush, and that flush can
           take more than one animation frame under load. A fixed wait raced
           it and read the still-resting value back; two consecutive equal
           samples can race it too, since two frames can both land before the
           repaint and agree on the stale resting value. Waiting for the read
           to actually move off the already-known resting value first, then
           for it to stop moving, is what actually settles on the real one --
           the same two-phase settling `scripts/generate-palette.mjs` polls
           for before its own hover read. */
        const hovered = await page.evaluate(
          ({ key, restingBg, restingEdge }) => {
            const element = document.querySelector(`[data-key="${key}"]`)!;
            const read = () => {
              const styles = getComputedStyle(element);
              return { bg: styles.backgroundColor, edge: styles.borderTopColor };
            };
            const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

            return (async () => {
              let current = read();

              for (let frame = 0; frame < 60 && current.bg === restingBg && current.edge === restingEdge; frame += 1) {
                await nextFrame();
                current = read();
              }

              let previous = current;

              for (let frame = 0; frame < 60; frame += 1) {
                await nextFrame();
                current = read();

                if (current.bg === previous.bg && current.edge === previous.edge) {
                  return current;
                }
                previous = current;
              }

              return previous;
            })();
          },
          { key: probe.key, restingBg: rest[probe.key].bg, restingEdge: rest[probe.key].edge },
        );

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
     both, as `color-scheme` does. */
  test("follows the nearest explicit theme, nested either way", async ({ page }) => {
    const values = await page.evaluate(() => {
      const read = (element: Element) => getComputedStyle(element).getPropertyValue("--palette-text").trim();
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div data-theme="dark" id="outer"><div class="light" id="light"><div class="theme-dark" id="dark"></div></div></div><div class="light dark" id="both"></div>',
      );

      return {
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
  });
});
