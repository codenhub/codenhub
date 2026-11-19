import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";
import { flattenColor, getContrastRatio, readSrgb, settleAnimations } from "./test-utils";

/* What `prefers-contrast: more` promises, in docs/accessibility.md: every line
   the package rests below 3:1 by choice reaches it, and glass turns opaque.
   Read off the files a consumer links, as `structure.spec.ts` does. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const built = (file: string) => readFile(path.join(packageRoot, "dist", file), "utf8");

const THEMES = ["light", "dark"] as const;
const INTENTS = ["neutral", "primary", "secondary", "success", "warning", "destructive", "info"] as const;
/* The aesthetics that draw a surface's edge as a border. Glass has its own
   test below; pixel draws an inset ring in its ink, the page's text colour. */
const AESTHETICS = ["chunky-tile", "cyber", "glass", "neobrutalism", "sketch"] as const;
const SOFT_EDGED = ["alert", "panel", "badge", "kbd", "code", "pre"] as const;
const MINIMUM = 3;

const load = async (page: Page, theme: string, markup: string) => {
  await page.setContent(`<!doctype html><html data-theme="${theme}"><body>${markup}</body></html>`);
  await page.addStyleTag({ content: await built("index.css") });
  await page.addStyleTag({ content: await built("aesthetics/index.css") });
  await settleAnimations(page);
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
   two is the one a reader has to make the line out against. The side has to
   be painted, so a line that is not drawn at all cannot pass on its colour. */
const lineContrast = async (page: Page, testId: string, property = "border-top-color") => {
  const side = property.replace(/-color$/, "");

  expect(await style(page, testId, `${side}-style`), `${testId} ${side} style`).not.toMatch(/^(none|hidden)$/);
  expect(Number.parseFloat(await style(page, testId, `${side}-width`)), `${testId} ${side} width`).toBeGreaterThan(0);

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

    /* Glass draws its rules in an ink of their own, which kept its 20%
       hairline under this preference while its surface line took the control
       grey: a divider and a table rule under 2:1. */
    test("draws every aesthetic's neutral line and rules at 3:1", async ({ page }) => {
      await load(
        page,
        theme,
        AESTHETICS.map(
          (aesthetic) =>
            `<div class="${aesthetic}"><div data-testid="${aesthetic}" class="card">c</div>` +
            `<hr data-testid="${aesthetic}-divider" class="divider" />` +
            `<table class="data-table"><thead><tr><th data-testid="${aesthetic}-head">h</th></tr></thead></table></div>`,
        ).join(""),
      );

      const lines = await Promise.all(
        AESTHETICS.map(async (aesthetic) => ({
          aesthetic,
          head: await lineContrast(page, `${aesthetic}-head`, "border-bottom-color"),
          divider: await lineContrast(page, `${aesthetic}-divider`),
          surface: await lineContrast(page, aesthetic),
        })),
      );

      for (const { aesthetic, divider, head, surface } of lines) {
        expect(surface, aesthetic).toBeGreaterThanOrEqual(MINIMUM);
        expect(divider, `${aesthetic} divider`).toBeGreaterThanOrEqual(MINIMUM);
        expect(head, `${aesthetic} head rule`).toBeGreaterThanOrEqual(MINIMUM);
      }
    });

    test("draws a neutral chunky-tile solo line at 3:1", async ({ page }) => {
      await load(page, theme, `<div data-testid="solo" class="chunky-tile-solo">s</div>`);

      expect(await lineContrast(page, "solo")).toBeGreaterThanOrEqual(MINIMUM);
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
         <div data-testid="solo" class="glass-solo">s</div>
         <div data-testid="solo-liquid" class="glass-solo glass-liquid">s</div>`,
      );

      for (const testId of ["card", "liquid", "solo", "solo-liquid"]) {
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

/* On a solid surface a field's line was the page's control border, which the
   preference raised to 1.0 to 1.6:1 against the surface on every intent but
   primary. The app's attribute stands in for the query, as everywhere. */
for (const theme of THEMES) {
  test(`rests a text control's line at 3:1 on a solid surface under increased contrast, ${theme}`, async ({ page }) => {
    await load(
      page,
      theme,
      INTENTS.filter((intent) => intent !== "neutral")
        .map(
          (intent) =>
            `<div class="card solid ${intent}" data-testid="card-${intent}">
               <input data-testid="ipt-${intent}" class="ipt" />
               <div data-testid="group-${intent}" class="input-group"><input class="ipt" /></div>
             </div>`,
        )
        .join(""),
    );
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-contrast", "more");
    });
    await settleAnimations(page);

    for (const intent of INTENTS.filter((name) => name !== "neutral")) {
      // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
      const ground = flattenColor(await style(page, `card-${intent}`, "background-color"), await pageColor(page));

      for (const testId of [`ipt-${intent}`, `group-${intent}`]) {
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        const fill = flattenColor(await style(page, testId, "background-color"), ground);
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        const line = flattenColor(await style(page, testId, "border-top-color"), fill);

        expect(Math.min(getContrastRatio(line, ground), getContrastRatio(line, fill)), testId).toBeGreaterThanOrEqual(
          MINIMUM,
        );
      }
    }
  });
}

test("leaves a text control's resting line quiet without the preference", async ({ page }) => {
  await load(page, "light", `<input data-testid="ipt" class="ipt" />`);

  expect(await lineContrast(page, "ipt")).toBeLessThan(MINIMUM);
});
