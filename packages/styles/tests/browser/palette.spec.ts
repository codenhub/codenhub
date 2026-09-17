import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "./fixtures";
import { getColorDistance } from "./test-utils";

/* `docs/internal/generated-palette.md`'s whole premise is that `./palette`'s
   values are provably identical to what `box.css` itself renders, because
   they are read from a real browser rather than retyped by a person. This is
   that proof, run as a standing test rather than a one-off: every generated
   cell is checked against a freshly composed live probe -- the same
   `.box`/`.box-hover` classes and real `registry.json` intents
   `scripts/generate-palette.mjs` used to generate `src/palette.css` -- through
   the same `getColorDistance` contract the rest of this suite already trusts.
   A `box.css` change nobody regenerated the palette for fails here. */

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const registry = JSON.parse(await readFile(path.join(packageRoot, "registry.json"), "utf8")) as {
  intents: Record<string, unknown>;
};
const INTENTS = Object.keys(registry.intents);
const GROUNDS = [
  { suffix: "", token: undefined },
  { suffix: "page", token: "var(--color-background)" },
  { suffix: "subtle", token: "var(--intent-subtle)" },
] as const;

const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";

interface Probe {
  classes: string;
  key: string;
  name: string;
  readsBg: boolean;
  style?: string;
}

/* Mirrors `scripts/generate-palette.mjs`'s own `buildProbes`, and has to: this
   test's whole point is proving the generator's output against the same
   shape of input it was generated from. */
function buildProbes(): Probe[] {
  const probes: Probe[] = [];

  for (const intent of INTENTS) {
    probes.push({
      classes: `box box-hover ${intent} solid edged`,
      key: `${intent}-solid`,
      name: `${intent}-solid`,
      readsBg: true,
    });
    for (const presentation of ["soft", "ghost"] as const) {
      probes.push({
        classes: `box box-hover ${intent} ${presentation} edged`,
        key: `${intent}-${presentation}-fg`,
        name: `${intent}-${presentation}`,
        readsBg: false,
      });
      for (const ground of GROUNDS) {
        const name = ground.suffix === "" ? `${intent}-${presentation}` : `${intent}-${presentation}-${ground.suffix}`;

        probes.push({
          classes: `box box-hover ${intent} ${presentation} edged`,
          key: name,
          name,
          readsBg: true,
          style: ground.token === undefined ? undefined : `--_d-ground: ${ground.token}`,
        });
      }
    }
  }

  return probes;
}

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
          if (probe.style) {
            element.setAttribute("style", probe.style);
          }
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

      const generated = await page.evaluate((probeList) => {
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
          const slots = probe.readsBg
            ? { bg: read(`--palette-${probe.name}-bg`), edge: read(`--palette-${probe.name}-edge`) }
            : { fg: read(`--palette-${probe.name}-fg`) };
          const hoverSlots = probe.readsBg
            ? {
                bgHover: read(`--palette-${probe.name}-bg-hover`),
                edgeHover: read(`--palette-${probe.name}-edge-hover`),
              }
            : {};

          values[probe.key] = { ...slots, ...hoverSlots };
        }

        return values;
      }, probes);

      const mismatches: string[] = [];

      for (const probe of probes) {
        const live = rest[probe.key];
        const expected = generated[probe.key];
        const checks: [string, string | undefined, string | undefined][] = probe.readsBg
          ? [
              [`${probe.name} bg`, live.bg, expected.bg],
              [`${probe.name} edge`, live.edge, expected.edge],
              [`${probe.name} bg-hover`, live.bgHover, expected.bgHover],
              [`${probe.name} edge-hover`, live.edgeHover, expected.edgeHover],
            ]
          : [[`${probe.name} fg`, live.fg, expected.fg]];

        for (const [label, actual, wanted] of checks) {
          if (actual === undefined || wanted === undefined || getColorDistance(actual, wanted) > 2) {
            mismatches.push(`${label}: live ${actual} vs generated ${wanted}`);
          }
        }
      }

      expect(mismatches).toEqual([]);
    });
  }
});
