import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";
import { flattenColor, getContrastRatio, readSrgb } from "./test-utils";

/* What `prefers-contrast: more` promises, in docs/accessibility.md: every line
   the package rests below 3:1 by choice reaches it, and glass turns opaque.
   Read off the files a consumer links, as `structure.spec.ts` does. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const built = (file: string) => readFile(path.join(packageRoot, "dist", file), "utf8");

const THEMES = ["light", "dark"] as const;
const INTENTS = ["neutral", "primary", "secondary", "success", "warning", "destructive", "info"] as const;
/* The aesthetics that draw a surface's edge as a border. Glass has its own
   test below; pixel draws an inset ring in its ink, the page's text colour. */
const AESTHETICS = ["chunky-tile", "cyber", "neobrutalism", "sketch"] as const;
const SOFT_EDGED = ["alert", "panel", "badge", "kbd", "code", "pre"] as const;
const MINIMUM = 3;

const load = async (page: Page, theme: string, markup: string) => {
  await page.setContent(`<!doctype html><html data-theme="${theme}"><body>${markup}</body></html>`);
  await page.addStyleTag({ content: await built("index.css") });
  await page.addStyleTag({ content: await built("aesthetics/index.css") });
  /* `allSettled`: the theme attribute lands before the sheets do, and a
     transition the second sheet replaces rejects its `finished`. */
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)));
};

const style = (page: Page, testId: string, property: string) =>
  page.getByTestId(testId).evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

const pageColor = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-background)";
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();

    return color;
  });

/* The ratio of an element's top border, as painted, against what it sits on:
   the element's own fill inside it and the page outside it. The lower of the
   two is the one a reader has to make the line out against. */
const lineContrast = async (page: Page, testId: string, property = "border-top-color") => {
  const ground = await pageColor(page);
  const fill = flattenColor(await style(page, testId, "background-color"), ground);
  const line = flattenColor(await style(page, testId, property), fill);

  return Math.min(getContrastRatio(line, ground), getContrastRatio(line, fill));
};

for (const theme of THEMES) {
  test.describe(`prefers-contrast: more, ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ contrast: "more" });
    });

    test("rests a text control's line at 3:1", async ({ page }) => {
      await load(
        page,
        theme,
        `<input data-testid="ipt" class="ipt" />
         <textarea data-testid="textarea" class="textarea"></textarea>
         <select data-testid="select" class="select"><option>a</option></select>
         <div data-testid="group" class="input-group"><input class="ipt" /></div>
         <input data-testid="checkbox" type="checkbox" class="checkbox" />`,
      );

      for (const testId of ["ipt", "textarea", "select", "group", "checkbox"]) {
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        expect(await lineContrast(page, testId), testId).toBeGreaterThanOrEqual(MINIMUM);
      }
    });

    test("draws a neutral line at 3:1 on a surface, a divider, and a table", async ({ page }) => {
      await load(
        page,
        theme,
        `<div data-testid="card" class="card">c</div>
         <hr data-testid="divider" class="divider" />
         <table class="data-table"><thead><tr><th data-testid="head">h</th></tr></thead></table>`,
      );

      for (const testId of ["card", "divider"]) {
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        expect(await lineContrast(page, testId), testId).toBeGreaterThanOrEqual(MINIMUM);
      }
      expect(await lineContrast(page, "head", "border-bottom-color"), "head rule").toBeGreaterThanOrEqual(MINIMUM);
    });

    test("draws every aesthetic's neutral line at 3:1", async ({ page }) => {
      await load(
        page,
        theme,
        AESTHETICS.map(
          (aesthetic) => `<div class="${aesthetic}"><div data-testid="${aesthetic}" class="card">c</div></div>`,
        ).join(""),
      );

      for (const aesthetic of AESTHETICS) {
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        expect(await lineContrast(page, aesthetic), aesthetic).toBeGreaterThanOrEqual(MINIMUM);
      }
    });

    test("outlines a progress track at 3:1", async ({ page }) => {
      await load(page, theme, `<div data-testid="progress" class="progress" style="--progress-value: 40%"></div>`);

      expect(await lineContrast(page, "progress")).toBeGreaterThanOrEqual(MINIMUM);
    });

    test("draws an edged soft fill's line at 3:1 for every intent", async ({ page }) => {
      await load(
        page,
        theme,
        INTENTS.flatMap((intent) =>
          SOFT_EDGED.map(
            (component) =>
              `<div data-testid="${component}-${intent}" class="${component} soft edged ${intent}">a</div>`,
          ),
        ).join(""),
      );

      for (const intent of INTENTS) {
        for (const component of SOFT_EDGED) {
          // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
          expect(await lineContrast(page, `${component}-${intent}`), `${component} ${intent}`).toBeGreaterThanOrEqual(
            MINIMUM,
          );
        }
      }
    });

    test("grounds glass opaquely and drops its blur", async ({ page }) => {
      await load(
        page,
        theme,
        `<div class="glass"><div data-testid="card" class="card">c</div></div>
         <div class="glass glass-liquid"><div data-testid="liquid" class="card">c</div></div>
         <div data-testid="solo" class="glass-solo">s</div>`,
      );

      for (const testId of ["card", "liquid", "solo"]) {
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        expect(readSrgb(await style(page, testId, "background-color")).alpha, `${testId} ground`).toBe(1);
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        expect(await style(page, testId, "backdrop-filter"), `${testId} blur`).toBe("none");
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        expect(await lineContrast(page, testId), `${testId} line`).toBeGreaterThanOrEqual(MINIMUM);
      }
    });
  });
}

test("leaves a text control's resting line quiet without the preference", async ({ page }) => {
  await load(page, "light", `<input data-testid="ipt" class="ipt" />`);

  expect(await lineContrast(page, "ipt")).toBeLessThan(MINIMUM);
});
