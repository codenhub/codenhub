import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";
import { getColorDistance, readSrgb } from "./test-utils";

/* The registry says which axes each component reads. This asserts it, in both
   directions, and that pairing is the point: an axis listed as live must change
   what the component computes, and an axis left off must not.

   Written because the one-directional version of this test does not exist and
   its absence cost a release. `text-control` rewrote `--_edge` after `@apply
   box`, which dropped `--ui-border` out of the composition entirely, so `.edged`
   and `.edgeless` were inert on all six text controls and `--_d-border` was
   declared and never read on each of them. Every existing assertion passed:
   the classes resolved, the tokens were declared, the components rendered. The
   only observable symptom was that two documented classes did nothing, and
   nothing was looking for that. */

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

interface ComponentEntry {
  class: string;
  axes: ("fill" | "edge")[];
  axesTarget?: string;
  bounds?: { token: string; kind: "cap" | "floor"; value: string; escape: string | null; reason: string }[];
  composition?: "frame" | "none";
  default: { fill?: string; edge?: string; elevation: number };
  unsupported?: { axis: "fill" | "edge"; class: string; reason: string }[];
}

const registry = JSON.parse(await readFile(path.join(packageRoot, "registry.json"), "utf8")) as {
  components: ComponentEntry[];
};

const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";

/* Every axis, and the class that moves a component off its published default in
   each. A component resting at one end is probed from the other, so the probe is
   always asking for a change rather than restating what is already there.

   A class the registry marks unsupported is dropped from the probe rather than
   asserted about: the package does not maintain what it renders, so requiring it
   to move would be testing an outcome nobody promised. */
const FILL_CLASSES = ["solid", "soft", "ghost"] as const;
const EDGE_CLASSES = ["edged", "edgeless"] as const;

const supported = (component: ComponentEntry, axis: "fill" | "edge", classes: readonly string[]) =>
  classes.filter((name) => !component.unsupported?.some((entry) => entry.axis === axis && entry.class === name));

/* The markup each component needs to paint at all. Anything not listed is a
   plain `<div>`, which is enough for a box. */
const TAGS: Record<string, string> = {
  ipt: "input",
  textarea: "textarea",
  select: "select",
  checkbox: "input",
  radio: "input",
  switch: "input",
  "data-table": "table",
  pre: "pre",
  code: "code",
  kbd: "kbd",
  quote: "blockquote",
  btn: "button",
  badge: "span",
  loader: "span",
};

const TYPES: Record<string, string> = { checkbox: "checkbox", radio: "radio", switch: "checkbox" };

type Painted = { background: string; borderColor: string; borderWidth: string };

/* Most components paint their own box. A tooltip does not: the element is a
   positioning wrapper and the bubble is its `::after`, so probing the element
   would report "reads no axes" for a component that reads both. The registry
   carries the target, so the exception is data rather than a branch here. */
const readPainted = async (
  page: Page,
  className: string,
  tag: string,
  type: string | undefined,
  target: string | undefined,
) =>
  page.evaluate(
    ({ className: probeClass, tag: probeTag, target: probeTarget, type: probeType }) => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const element = document.createElement(probeTag);

      element.className = probeClass;

      if (probeType) {
        element.setAttribute("type", probeType);
      }

      element.setAttribute("data-tooltip", "Probe");
      element.textContent = "Probe";
      host.append(element);

      const styles = getComputedStyle(element, probeTarget ?? null);
      const painted = {
        background: styles.backgroundColor,
        borderColor: styles.borderTopColor,
        borderWidth: styles.borderTopWidth,
      };

      element.remove();

      return painted;
    },
    { className, tag, target, type },
  );

const differs = (left: Painted, right: Painted) =>
  getColorDistance(left.background, right.background) > 2 ||
  getColorDistance(left.borderColor, right.borderColor) > 2 ||
  left.borderWidth !== right.borderWidth;

test.describe("axes", () => {
  const painted = registry.components.filter((component) => component.composition !== "none");

  for (const component of painted) {
    const tag = TAGS[component.class] ?? "div";
    const type = TYPES[component.class];

    test(`${component.class} reads exactly the axes the registry publishes`, async ({ page }) => {
      await page.goto(SURFACES_URL);

      const target = component.axesTarget;
      const base = await readPainted(page, component.class, tag, type, target);

      const fillResults = await Promise.all(
        supported(component, "fill", FILL_CLASSES).map(async (fill) => ({
          fill,
          painted: await readPainted(page, `${component.class} ${fill}`, tag, type, target),
        })),
      );
      const edgeResults = await Promise.all(
        supported(component, "edge", EDGE_CLASSES).map(async (edge) => ({
          edge,
          painted: await readPainted(page, `${component.class} ${edge}`, tag, type, target),
        })),
      );

      const fillMoves = fillResults.some((result) => differs(result.painted, base));
      const edgeMoves = edgeResults.some((result) => differs(result.painted, base));

      expect(
        fillMoves,
        `${component.class}: registry says fill ${component.axes.includes("fill") ? "live" : "inert"}`,
      ).toBe(component.axes.includes("fill"));
      expect(
        edgeMoves,
        `${component.class}: registry says edge ${component.axes.includes("edge") ? "live" : "inert"}`,
      ).toBe(component.axes.includes("edge"));
    });
  }

  /* The bound that replaced the switch's fill-decides-edge exception. Its fills
     used to land on one look, so the component varied the line per fill class
     instead -- the only place in the package where a fill class decided an edge.
     Raising the cap retires that, and this is the measurement the cap was chosen
     against: two resting fills that separate from each other and from the page,
     both clearly below a checked track.

     `.ghost` is not probed. It is unsupported on a toggle, so what it renders is
     not a promise the package keeps.

     Measured on the composited pixel rather than the computed string, because a
     `color-mix()` carrying alpha says nothing about what the eye gets. */
  test("switch fills separate from each other and from checked", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const tracks = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const ground = getComputedStyle(document.body).backgroundColor;

      const read = (className: string, checked: boolean) => {
        const element = document.createElement("input");

        element.type = "checkbox";
        element.className = className;
        element.checked = checked;
        host.append(element);

        const background = getComputedStyle(element).backgroundColor;

        element.remove();

        return background;
      };

      return {
        checked: read("switch primary", true),
        ground,
        soft: read("switch primary soft", false),
        solid: read("switch primary solid", false),
      };
    });

    const flatten = (color: string) => {
      const top = readSrgb(color);
      const bottom = readSrgb(tracks.ground);
      const channel = (key: "blue" | "green" | "red") =>
        Math.round(top[key] * top.alpha + bottom[key] * (1 - top.alpha));

      return `rgb(${channel("red")} ${channel("green")} ${channel("blue")})`;
    };

    const page_ = tracks.ground;
    const soft = flatten(tracks.soft);
    const solid = flatten(tracks.solid);
    const checked = flatten(tracks.checked);

    /* Roughly 20 sRGB steps is a clearly visible difference, which is the
       threshold the hover step was measured against. Each neighbouring pair
       clears it, and the gap from an unchecked `.solid` to a checked track is
       what keeps the two states from reading alike. */
    expect(getColorDistance(page_, soft), `page ${page_} vs soft ${soft}`).toBeGreaterThan(10);
    expect(getColorDistance(soft, solid), `soft ${soft} vs solid ${solid}`).toBeGreaterThan(20);
    expect(getColorDistance(solid, checked), `solid ${solid} vs checked ${checked}`).toBeGreaterThan(40);
  });

  /* Presentation reaches the checked state, which it did not until `:checked`
     stopped writing `--_fill` and `--_fg` outright and started lifting the
     bounds instead. Every checked toggle used to render the same filled box
     whatever fill class it carried.

     Three things are asserted together because they are one rule seen from three
     sides: the fill class decides the checked plate, the mark stays readable on
     whatever plate that is, and an unsupported `.ghost` is floored rather than
     left as a mark on nothing. */
  for (const control of ["checkbox", "radio", "switch"] as const) {
    test(`${control} composes its checked fill and keeps the mark on a ground`, async ({ page }) => {
      await page.goto(SURFACES_URL);

      const read = await page.evaluate(
        ({ className, type }) => {
          const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
          const probe = (extra: string, checked: boolean) => {
            const element = document.createElement("input");

            element.type = type;
            element.className = `${className} ${extra}`.trim();
            element.checked = checked;
            host.append(element);

            const styles = getComputedStyle(element);
            const painted = { fill: styles.backgroundColor, mark: styles.color };

            element.remove();

            return painted;
          };

          return {
            ghostChecked: probe("ghost", true),
            softChecked: probe("soft", true),
            softResting: probe("soft", false),
            solidChecked: probe("solid", true),
            solidResting: probe("solid", false),
          };
        },
        { className: control, type: control === "radio" ? "radio" : "checkbox" },
      );

      const alpha = (color: string) => readSrgb(color).alpha;

      /* `.solid` reaches the full fill its name asks for; `.soft` stays at the
         tint its name asks for. Equal here is the old behaviour returning. */
      expect(alpha(read.solidChecked.fill), `${control} checked .solid fills`).toBeGreaterThan(0.9);
      expect(alpha(read.softChecked.fill), `${control} checked .soft stays a tint`).toBeLessThan(0.5);
      expect(alpha(read.solidChecked.fill), `${control} checked .solid and .soft are different plates`).toBeGreaterThan(
        alpha(read.softChecked.fill),
      );

      /* The cap lifts only for the checked state, so `.solid` still separates
         from itself across the two. */
      expect(alpha(read.solidChecked.fill), `${control} .solid checked outfills its resting plate`).toBeGreaterThan(
        alpha(read.solidResting.fill),
      );

      /* The mark reads on every one of those plates, which is `--_on-fill`
         following the fill rather than a pinned contrast tone. */
      for (const [label, painted] of Object.entries(read)) {
        const ground = getColorDistance(painted.fill, painted.mark);

        expect(ground, `${control} ${label} mark is not its own ground`).toBeGreaterThan(20);
      }

      /* `.ghost` is unsupported on a toggle, so the checked floor gives its mark
         a ground rather than leaving a tick on the page. */
      expect(alpha(read.ghostChecked.fill), `${control} checked .ghost is floored`).toBeGreaterThan(0);
      expect(alpha(read.softResting.fill), `${control} resting .soft still tints`).toBeGreaterThan(0);
    });
  }

  /* The two bounds with no escape. `.checkbox` and `.radio` keep their line
     whatever the edge class says, on the element or on a container, because an
     unchecked box is a transparent square and an unchecked radio a transparent
     circle: removing the line removes the control (WCAG 1.4.11). Published as
     unsupported rather than clamped quietly. */
  for (const control of ["checkbox", "radio"] as const) {
    test(`${control} keeps its line under .edgeless on the element and on a container`, async ({ page }) => {
      await page.goto(SURFACES_URL);

      const widths = await page.evaluate((className) => {
        const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
        const container = document.createElement("div");

        container.className = "edgeless";
        host.append(container);

        const build = (elementClass: string, parent: Element) => {
          const element = document.createElement("input");

          element.type = className === "radio" ? "radio" : "checkbox";
          element.className = elementClass;
          parent.append(element);

          const styles = getComputedStyle(element);

          return { color: styles.borderTopColor, width: styles.borderTopWidth };
        };

        const result = {
          cascaded: build(className, container),
          own: build(`${className} edgeless`, host),
        };

        container.remove();

        return result;
      }, control);

      for (const [source, measured] of Object.entries(widths)) {
        expect(Number.parseFloat(measured.width), `${control} ${source} border width`).toBeGreaterThan(0);
        expect(readSrgb(measured.color).alpha, `${control} ${source} border alpha`).toBeGreaterThan(0.5);
      }
    });
  }

  /* The escape the three text inputs and the switch do have. A container's
     `.edgeless` is our own cascade reaching a field nobody classed, so the floor
     answers it; the element's own `.edgeless` is a consumer naming what they
     want, so it wins. Both halves are asserted, because a floor that never
     yields and a floor that always yields are the two ways to get this wrong. */
  for (const control of ["ipt", "textarea", "select", "switch"] as const) {
    test(`${control} floors a cascaded .edgeless and honours its own`, async ({ page }) => {
      await page.goto(SURFACES_URL);

      const measured = await page.evaluate(
        ({ className, tag, type }) => {
          const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
          const container = document.createElement("div");

          container.className = "edgeless";
          host.append(container);

          const build = (elementClass: string, parent: Element) => {
            const element = document.createElement(tag);

            element.className = elementClass;

            if (type) {
              element.setAttribute("type", type);
            }

            parent.append(element);

            return getComputedStyle(element).borderTopColor;
          };

          const result = { cascaded: build(className, container), own: build(`${className} edgeless`, host) };

          container.remove();

          return result;
        },
        {
          className: control,
          tag: control === "switch" ? "input" : control === "ipt" ? "input" : control,
          type: control === "switch" ? "checkbox" : control === "ipt" ? "text" : undefined,
        },
      );

      expect(readSrgb(measured.cascaded).alpha, `${control} cascaded .edgeless keeps its line`).toBeGreaterThan(0.5);
      expect(readSrgb(measured.own).alpha, `${control} own .edgeless removes its line`).toBeLessThan(0.1);
    });
  }
});
