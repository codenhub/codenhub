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

/* WCAG 1.4.11 holds for a field at rest without asking for more contrast. A
   field once rested at 60% of its line, so hover had a step to take: 2.2:1 for
   a neutral field in both themes, and under 3:1 for most intents. Every text
   control and every intent, against the page and the field's own fill. */
for (const theme of THEMES) {
  test(`rests every text control's line at 3:1 without the preference, ${theme}`, async ({ page }) => {
    await load(
      page,
      theme,
      INTENTS.map(
        (intent) =>
          `<input data-testid="ipt-${intent}" class="ipt ${intent}" />
           <textarea data-testid="textarea-${intent}" class="textarea ${intent}"></textarea>
           <select data-testid="select-${intent}" class="select ${intent}"><option>a</option></select>
           <div data-testid="group-${intent}" class="input-group ${intent}"><input class="ipt" /></div>`,
      ).join(""),
    );

    for (const intent of INTENTS) {
      for (const control of ["ipt", "textarea", "select", "group"]) {
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        const ratio = await lineContrast(page, `${control}-${intent}`);
        expect.soft(ratio, `${control} ${intent}`).toBeGreaterThanOrEqual(MINIMUM);
      }
    }
  });
}

/* docs/accessibility.md promises every intent's `.solid` label 4.5:1 in both
   themes. Hover swaps the plate for `--intent-hover`, a tone baked per theme,
   so the promise has to hold there too: dark success's hover once lightened
   its plate to 3.98:1 under the neutral-50 label. Every aesthetic is read,
   since one may restate the fill or the ink, and a solid interactive card
   takes the same hover tone as the button. */
const SOLID_REGIONS = [
  ["default", ""],
  ["chunky-tile", "chunky-tile"],
  ["cyber", "cyber"],
  ["glass", "glass"],
  ["glass-liquid", "glass glass-liquid"],
  ["neobrutalism", "neobrutalism"],
  ["pixel", "pixel"],
  ["sketch", "sketch"],
] as const;
const SOLID_COMPONENTS = [
  ["btn", "btn solid"],
  ["card", "card interactive solid"],
] as const;

for (const theme of THEMES) {
  test(`prints every intent's solid label at 4.5:1 at rest and on hover, ${theme}`, async ({ page }) => {
    await load(
      page,
      theme,
      SOLID_REGIONS.map(
        ([name, region]) =>
          `<div class="${region}" style="padding: 1rem">${INTENTS.flatMap((intent) =>
            SOLID_COMPONENTS.map(
              ([component, classes]) =>
                `<button data-testid="${name}-${component}-${intent}" class="${classes} ${intent}">Label</button>`,
            ),
          ).join("")}</div>`,
      ).join(""),
    );
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });

    const ground = await pageColor(page);
    const ratio = async (testId: string) => {
      const plate = flattenColor(await style(page, testId, "background-color"), ground);

      return getContrastRatio(flattenColor(await style(page, testId, "color"), plate), plate);
    };

    for (const [name] of SOLID_REGIONS) {
      for (const intent of INTENTS) {
        for (const [component] of SOLID_COMPONENTS) {
          const testId = `${name}-${component}-${intent}`;

          // oxlint-disable-next-line no-await-in-loop -- one pointer, moved in turn.
          expect.soft(await ratio(testId), `${testId} at rest`).toBeGreaterThanOrEqual(4.5);
          // oxlint-disable-next-line no-await-in-loop -- one pointer, moved in turn.
          await page.getByTestId(testId).hover();
          // oxlint-disable-next-line no-await-in-loop -- one pointer, moved in turn.
          expect.soft(await ratio(testId), `${testId} on hover`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
}

/* Glass grounds a surface on a translucent pane, which shows whatever is
   behind it. Nested in a `.solid` surface, the plate showed through: a ghost
   or soft neutral card in a `.card.solid.primary` read 3.0 to 3.99:1. A
   surface resting on a plate takes an opaque ground, so its text keeps the
   4.5:1 it has on the page. The plate is read over the page, as the pane is
   read over the plate. */
const PLATES = ["neutral", "primary", "secondary", "success", "warning", "destructive", "info"] as const;
const PANES = ["card ghost", "card soft", "panel", "alert", "card"] as const;

for (const theme of THEMES) {
  for (const region of ["glass", "glass glass-liquid"]) {
    test(`prints a pane's text at 4.5:1 on a solid surface under .${region.replace(" ", ".")}, ${theme}`, async ({
      page,
    }) => {
      await load(
        page,
        theme,
        `<div class="${region}">${PLATES.map(
          (plate) =>
            `<div class="card solid ${plate}" data-testid="plate-${plate}">${INTENTS.flatMap((intent) =>
              PANES.map(
                (pane, index) => `<div class="${pane} ${intent}" data-testid="${plate}-${intent}-${index}">Text</div>`,
              ),
            ).join("")}</div>`,
        ).join("")}</div>`,
      );

      const ground = await pageColor(page);

      for (const plate of PLATES) {
        // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
        const under = flattenColor(await style(page, `plate-${plate}`, "background-color"), ground);

        for (const intent of INTENTS) {
          for (const [index, pane] of PANES.entries()) {
            const testId = `${plate}-${intent}-${index}`;
            // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
            const fill = flattenColor(await style(page, testId, "background-color"), under);
            // oxlint-disable-next-line no-await-in-loop -- one page, read in turn.
            const ink = flattenColor(await style(page, testId, "color"), fill);

            expect.soft(getContrastRatio(ink, fill), `${pane} ${intent} on ${plate}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    });
  }
}

/* The contrast policy, `docs/guidelines/accessibility.md`: text at 4.5:1 on
   the ground it sits on in every state, the edge that is a toggle's only
   boundary at 3:1, and a focus ring at 3:1 against what is next to it, in both
   themes, with the standard contrast and with more. Every aesthetic is read,
   since one may restate a fill, an ink, a line, or the ring.

   Each page is read in one call rather than a property at a time: read one
   by one, these tests took the browser suite past `hub`'s 30-minute limit. */
const CONTRASTS = ["standard", "more"] as const;
const PRESENTATIONS = ["", "soft", "ghost", "solid"] as const;

const loadIn = async (page: Page, theme: string, contrast: string, markup: string) => {
  await page.setContent(
    `<!doctype html><html data-theme="${theme}" data-contrast="${contrast}" data-motion="none"><body>${markup}</body></html>`,
  );
  await page.addStyleTag({ content: await built("index.css") });
  await page.addStyleTag({ content: await built("aesthetics/index.css") });
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" });
  await settleAnimations(page);
};

type Painted = {
  page: string;
  /* Every background from the root down to the element's parent. */
  stack: string[];
  fill: string;
  color: string;
  borderColor: string;
  borderWidth: number;
  shadow: string;
  outlineStyle: string;
  outlineWidth: number;
  outlineColor: string;
  focused: boolean;
};

/* What the elements named by `testIds`, or every `[data-testid]`, are painted
   with, read in the page in one call. */
const paint = (page: Page, testIds?: string[]) =>
  page.evaluate((ids) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-background)";
    document.body.append(probe);
    const ground = getComputedStyle(probe).backgroundColor;
    probe.remove();

    const elements = ids
      ? ids.map((id) => document.querySelector(`[data-testid="${id}"]`)!)
      : [...document.querySelectorAll("[data-testid]")];

    return Object.fromEntries(
      elements.map((element) => {
        const styles = getComputedStyle(element);
        const stack: string[] = [];
        for (let node = element.parentElement; node; node = node.parentElement) {
          stack.unshift(getComputedStyle(node).backgroundColor);
        }

        return [
          element.getAttribute("data-testid")!,
          {
            page: ground,
            stack,
            fill: styles.backgroundColor,
            color: styles.color,
            borderColor: styles.borderTopColor,
            borderWidth: Number.parseFloat(styles.borderTopWidth),
            shadow: styles.boxShadow,
            outlineStyle: styles.outlineStyle,
            outlineWidth: Number.parseFloat(styles.outlineWidth),
            outlineColor: styles.outlineColor,
            focused: element.matches(":focus-visible"),
          },
        ];
      }),
    ) as Record<string, Painted>;
  }, testIds);

/* The ground under an element, its stack laid over the page in turn, and its
   own fill over that. */
const groundsOf = ({ page, stack, fill }: Painted) => {
  const under = stack.reduce((below, layer) => flattenColor(layer, below), page);

  return { under, fill: flattenColor(fill, under) };
};

const textRatio = (painted: Painted) => {
  const { fill } = groundsOf(painted);

  return getContrastRatio(flattenColor(painted.color, fill), fill);
};

const TEXT_COMPONENTS = [
  ["btn", (classes: string) => `<button class="btn ${classes}">Label</button>`, true],
  ["card", (classes: string) => `<div class="card interactive ${classes}">Text</div>`, true],
  ["badge", (classes: string) => `<span class="badge ${classes}">Badge</span>`, false],
  ["alert", (classes: string) => `<div class="alert ${classes}">Text</div>`, false],
  ["panel", (classes: string) => `<div class="panel ${classes}">Text</div>`, false],
  ["kbd", (classes: string) => `<kbd class="kbd ${classes}">K</kbd>`, false],
  ["code", (classes: string) => `<code class="code ${classes}">c</code>`, false],
] as const;

const caseId = (name: string, component: string, intent: string, presentation: string) =>
  `${name}-${component}-${intent}-${presentation || "default"}`;

/* One test per aesthetic: every hover is a pointer move, and the eight
   regions on one page ran past the test timeout in Firefox and WebKit.
   Hover is read with the standard contrast only, since increased contrast
   changes lines and leaves text and fills alone (docs/accessibility.md,
   "Increased contrast"), and not on `.solid`, whose hover the test above
   reads in every aesthetic. */
for (const theme of THEMES) {
  for (const contrast of CONTRASTS) {
    for (const [name, region] of SOLID_REGIONS) {
      test(`prints every component's text at 4.5:1 ${contrast === "standard" ? "at rest and on hover" : "at rest"}, ${name}, ${theme}, ${contrast} contrast`, async ({
        page,
      }) => {
        await loadIn(
          page,
          theme,
          contrast,
          `<div class="${region}" style="padding: 1rem">${INTENTS.flatMap((intent) =>
            PRESENTATIONS.flatMap((presentation) =>
              TEXT_COMPONENTS.map(([component, markup]) =>
                markup(`${presentation} ${intent}`).replace(
                  /^<(\w+)/,
                  `<$1 data-testid="${caseId(name, component, intent, presentation)}"`,
                ),
              ),
            ),
          ).join("")}</div>`,
        );

        const rest = await paint(page);
        for (const [testId, painted] of Object.entries(rest)) {
          expect.soft(textRatio(painted), `${testId} at rest`).toBeGreaterThanOrEqual(4.5);
        }

        const hovered = contrast === "standard" ? PRESENTATIONS.filter((presentation) => presentation !== "solid") : [];
        for (const intent of INTENTS) {
          for (const presentation of hovered) {
            for (const [component] of TEXT_COMPONENTS.filter(([, , hovers]) => hovers)) {
              const testId = caseId(name, component, intent, presentation);
              // oxlint-disable-next-line no-await-in-loop -- one pointer, moved in turn.
              await page.getByTestId(testId).hover();
              // oxlint-disable-next-line no-await-in-loop -- one pointer, moved in turn.
              const { [testId]: painted } = await paint(page, [testId]);

              expect.soft(textRatio(painted!), `${testId} on hover`).toBeGreaterThanOrEqual(4.5);
            }
          }
        }
      });
    }
  }
}

/* An unchecked toggle's border is the only thing that shows it, so it is the
   one resting edge the policy holds at 3:1 without the preference. */
const TOGGLES = [
  ["checkbox", `type="checkbox" class="checkbox`],
  ["radio", `type="radio" class="radio`],
  ["switch", `type="checkbox" class="switch`],
] as const;

/* Pixel draws the line as an inset shadow and no border. */
const INSET_PATTERN = /((?:rgba?|oklch|oklab|color)\([^)]*\))[^,]*\binset\b/;

for (const theme of THEMES) {
  for (const contrast of CONTRASTS) {
    test(`rests an unchecked toggle's line at 3:1, ${theme}, ${contrast} contrast`, async ({ page }) => {
      await loadIn(
        page,
        theme,
        contrast,
        SOLID_REGIONS.map(
          ([name, region]) =>
            `<div class="${region}" style="padding: 1rem">${INTENTS.flatMap((intent) =>
              TOGGLES.map(
                ([toggle, attributes]) =>
                  `<input data-testid="${name}-${toggle}-${intent}" ${attributes} ${intent}" />`,
              ),
            ).join("")}</div>`,
        ).join(""),
      );

      for (const [testId, painted] of Object.entries(await paint(page))) {
        const { under, fill } = groundsOf(painted);
        const drawn = painted.borderWidth > 0 ? painted.borderColor : painted.shadow.match(INSET_PATTERN)?.[1];

        expect.soft(drawn, `${testId} draws a line`).toBeDefined();
        const line = flattenColor(drawn ?? "transparent", fill);
        expect
          .soft(Math.min(getContrastRatio(line, under), getContrastRatio(line, fill)), testId)
          .toBeGreaterThanOrEqual(MINIMUM);
      }
    });
  }
}

/* A ring is an outline or, on the toggles, a box shadow of one or more
   layers. One layer at 3:1 against the ground outside the control is enough:
   a ring may lay a gap in the page's colour under its colour. */
const COLOR_PATTERN = /(?:rgba?|oklch|oklab|color)\([^)]*\)/g;
const ringRatio = (painted: Painted) => {
  const { under } = groundsOf(painted);
  const colors =
    painted.outlineStyle !== "none" && painted.outlineWidth > 0
      ? [painted.outlineColor]
      : (painted.shadow.match(COLOR_PATTERN) ?? []);

  return Math.max(0, ...colors.map((color) => getContrastRatio(flattenColor(color, under), under)));
};

const FOCUSABLE = [
  ...PRESENTATIONS.map(
    (presentation) =>
      [`btn-${presentation || "default"}`, `<button class="btn ${presentation}`, `">Label</button>`] as const,
  ),
  ["ipt", `<input class="ipt`, `" />`],
  ["select", `<select class="select`, `"><option>a</option></select>`],
  ["checkbox", `<input type="checkbox" class="checkbox`, `" />`],
  ["radio", `<input type="radio" class="radio`, `" />`],
  ["switch", `<input type="checkbox" class="switch`, `" />`],
] as const;

/* One key press puts the page in keyboard modality, so focus moved by a
   script after it is keyboard focus and every control is read in one call.
   `focused` is asserted, so an engine that drops the modality fails here
   rather than passing on a ring it never drew. */
const paintFocused = (page: Page) =>
  page.evaluate(() => {
    const ids = [...document.querySelectorAll("[data-testid]:not([data-testid='before'])")].map((element) =>
      element.getAttribute("data-testid")!,
    );
    const read: Record<
      string,
      { outlineStyle: string; outlineWidth: number; outlineColor: string; shadow: string; focused: boolean }
    > = {};
    for (const id of ids) {
      const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      element.focus();
      const styles = getComputedStyle(element);
      read[id] = {
        outlineStyle: styles.outlineStyle,
        outlineWidth: Number.parseFloat(styles.outlineWidth),
        outlineColor: styles.outlineColor,
        shadow: styles.boxShadow,
        focused: element.matches(":focus-visible"),
      };
    }

    return read;
  });

for (const theme of THEMES) {
  for (const contrast of CONTRASTS) {
    test(`draws every focus ring at 3:1 against its ground, ${theme}, ${contrast} contrast`, async ({ page }) => {
      await loadIn(
        page,
        theme,
        contrast,
        `<button data-testid="before">.</button>${SOLID_REGIONS.map(
          ([name, region]) =>
            `<div class="${region}" style="padding: 1rem">${INTENTS.flatMap((intent) =>
              FOCUSABLE.map(
                ([control, open, close]) => `${open} ${intent}" data-testid="${name}-${control}-${intent}${close}`,
              ),
            ).join("")}</div>`,
        ).join("")}`,
      );

      await page.getByTestId("before").focus();
      await page.keyboard.press("Tab");
      const grounds = await paint(page);
      const focused = await paintFocused(page);

      for (const [testId, ring] of Object.entries(focused)) {
        expect.soft(ring.focused, `${testId} has focus`).toBe(true);
        expect.soft(ringRatio({ ...grounds[testId]!, ...ring }), `${testId} ring`).toBeGreaterThanOrEqual(MINIMUM);
      }
    });
  }
}

/* Pressed is the third state the text rule holds in. Read with the standard
   contrast only, for the reason hover is above, and in every presentation,
   `.solid` included, since no other test presses one. One test per aesthetic
   and theme, for the pointer moves. */
const PRESSABLE = TEXT_COMPONENTS.filter(([, , hovers]) => hovers);

for (const theme of THEMES) {
  for (const [name, region] of SOLID_REGIONS) {
    test(`prints every pressable component's text at 4.5:1 when pressed, ${name}, ${theme}`, async ({ page }) => {
      await loadIn(
        page,
        theme,
        "standard",
        `<div class="${region}" style="padding: 1rem">${INTENTS.flatMap((intent) =>
          PRESENTATIONS.flatMap((presentation) =>
            PRESSABLE.map(([component, markup]) =>
              markup(`${presentation} ${intent}`).replace(
                /^<(\w+)/,
                `<$1 data-testid="${caseId(name, component, intent, presentation)}"`,
              ),
            ),
          ),
        ).join("")}</div>`,
      );

      for (const intent of INTENTS) {
        for (const presentation of PRESENTATIONS) {
          for (const [component] of PRESSABLE) {
            const testId = caseId(name, component, intent, presentation);
            // oxlint-disable-next-line no-await-in-loop -- one pointer, moved in turn.
            await page.getByTestId(testId).hover();
            // oxlint-disable-next-line no-await-in-loop -- one pointer, pressed in turn.
            await page.mouse.down();
            // oxlint-disable-next-line no-await-in-loop -- read while the pointer is down.
            const { [testId]: painted } = await paint(page, [testId]);
            // oxlint-disable-next-line no-await-in-loop -- released before the next press.
            await page.mouse.up();

            expect.soft(textRatio(painted!), `${testId} pressed`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    });
  }
}

/* A state mark -- a checkbox's tick or dash, a radio's dot, a switch's knob,
   on or off -- at 3:1 against every fill its presentation can give the
   toggle. Each mark is the toggle's `::after`, painted as its background. */
const MARKED = [
  ["checkbox-checked", `<input type="checkbox" class="checkbox`, `" checked />`],
  ["checkbox-mixed", `<input type="checkbox" class="checkbox`, `" data-indeterminate />`],
  ["radio-checked", `<input type="radio" class="radio`, `" checked />`],
  ["switch-on", `<input type="checkbox" class="switch`, `" checked />`],
  ["switch-off", `<input type="checkbox" class="switch`, `" />`],
] as const;

for (const theme of THEMES) {
  for (const contrast of CONTRASTS) {
    test(`draws every toggle's state mark at 3:1 on its fill, ${theme}, ${contrast} contrast`, async ({ page }) => {
      await loadIn(
        page,
        theme,
        contrast,
        SOLID_REGIONS.map(
          ([name, region]) =>
            `<div class="${region}" style="padding: 1rem">${INTENTS.flatMap((intent) =>
              PRESENTATIONS.flatMap((presentation) =>
                MARKED.map(
                  ([mark, open, close]) =>
                    `${open} ${presentation} ${intent}" data-testid="${name}-${mark}-${intent}-${presentation || "default"}${close}`,
                ),
              ),
            ).join("")}</div>`,
        ).join(""),
      );
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLInputElement>("[data-indeterminate]")) {
          element.indeterminate = true;
        }
      });

      const grounds = await paint(page);
      const marks = await page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll("[data-testid]")].map((element) => [
            element.getAttribute("data-testid")!,
            getComputedStyle(element, "::after").backgroundColor,
          ]),
        ),
      );

      for (const [testId, painted] of Object.entries(grounds)) {
        const { fill } = groundsOf(painted);
        expect
          .soft(getContrastRatio(flattenColor(marks[testId]!, fill), fill), `${testId} mark`)
          .toBeGreaterThanOrEqual(MINIMUM);
      }
    });
  }
}

/* A progress bar's value against its track. At rest the filled part is a
   recorded exception (docs/guidelines/accessibility.md); with more contrast
   asked for it takes the intent's strong tone and has to clear 3:1. */
for (const theme of THEMES) {
  test(`fills every progress bar at 3:1 against its track under increased contrast, ${theme}`, async ({ page }) => {
    await loadIn(
      page,
      theme,
      "more",
      SOLID_REGIONS.map(
        ([name, region]) =>
          `<div class="${region}" style="padding: 1rem">${INTENTS.map(
            (intent) =>
              `<div class="progress ${intent}" data-testid="${name}-progress-${intent}" style="--progress-value: 40%"></div>`,
          ).join("")}</div>`,
      ).join(""),
    );

    const grounds = await paint(page);
    const values = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("[data-testid]")].map((element) => [
          element.getAttribute("data-testid")!,
          getComputedStyle(element, "::after").backgroundColor,
        ]),
      ),
    );

    for (const [testId, painted] of Object.entries(grounds)) {
      const { fill: track } = groundsOf(painted);
      expect
        .soft(getContrastRatio(flattenColor(values[testId]!, track), track), `${testId} value`)
        .toBeGreaterThanOrEqual(MINIMUM);
    }
  });
}
