import { expect, test } from "./fixtures";
import { ORIGIN } from "./test-utils";

const LAYOUT_URL = `${ORIGIN}/layout/?env=vanilla`;

test("composes directional views with the shared layout gap", async ({ page }) => {
  await page.goto(LAYOUT_URL);

  const vertical = page.getByTestId("view-vertical");
  const horizontal = page.getByTestId("view-horizontal");

  await expect(vertical).toHaveCSS("display", "flex");
  await expect(vertical).toHaveCSS("flex-direction", "column");
  await expect(horizontal).toHaveCSS("display", "flex");
  await expect(horizontal).toHaveCSS("flex-wrap", "wrap");

  const gaps = await page.evaluate(() => ({
    horizontal: getComputedStyle(document.querySelector('[data-testid="view-horizontal"]')!).gap,
    vertical: getComputedStyle(document.querySelector('[data-testid="view-vertical"]')!).gap,
  }));

  expect(gaps.horizontal).toBe(gaps.vertical);
  expect(gaps.vertical).not.toBe("normal");
});

test("applies shared gap density modifiers to views", async ({ page }) => {
  await page.goto(LAYOUT_URL);

  const gaps = await page.evaluate(() => {
    const tightView = document.createElement("div");
    const looseView = document.createElement("div");
    tightView.className = "view vertical tight";
    looseView.className = "view vertical loose";
    document.body.append(tightView, looseView);

    return {
      loose: getComputedStyle(looseView).gap,
      tight: getComputedStyle(tightView).gap,
    };
  });

  expect(Number.parseFloat(gaps.tight)).toBeLessThan(Number.parseFloat(gaps.loose));
});

/* A density class is a modifier on its own element, like `.p-xs` on a card: a
   plain layout nested inside a `.tight` or `.loose` one keeps the default gap.
   `--layout-gap` set on a container still reaches it, because that is the
   token a consumer sets, not a class. */
test("keeps a density modifier on its own element", async ({ page }) => {
  await page.goto(LAYOUT_URL);

  const gaps = await page.evaluate(() => {
    const read = (outer: string, style = "") => {
      const host = document.createElement("div");
      host.className = outer;
      host.setAttribute("style", style);
      const inner = document.createElement("div");
      inner.className = "stack";
      host.append(inner);
      document.body.append(host);

      return { inner: getComputedStyle(inner).rowGap, outer: getComputedStyle(host).rowGap };
    };
    const plain = document.createElement("div");
    plain.className = "stack";
    document.body.append(plain);

    return {
      knob: read("stack", "--layout-gap: 2.5rem"),
      loose: read("cluster loose"),
      plain: getComputedStyle(plain).rowGap,
      tight: read("stack tight"),
    };
  });

  expect(gaps.tight.outer).toBe("8px");
  expect(gaps.tight.inner, "inside .tight").toBe(gaps.plain);
  expect(gaps.loose.outer).toBe("24px");
  expect(gaps.loose.inner, "inside .loose").toBe(gaps.plain);
  expect(gaps.knob.outer).toBe("40px");
  expect(gaps.knob.inner, "a container's --layout-gap").toBe("40px");
});

test("provides opt-in section width and spacing helpers", async ({ page }) => {
  await page.goto(LAYOUT_URL);

  const styles = await page.getByTestId("section-content").evaluate((element) => {
    const computed = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();

    return {
      inlineOffsetDifference: Math.abs(bounds.left - (window.innerWidth - bounds.right)),
      maxWidth: computed.maxWidth,
      width: computed.width,
    };
  });

  expect(styles.inlineOffsetDifference).toBeLessThan(1);
  expect(styles.maxWidth).not.toBe("none");
  expect(Number.parseFloat(styles.width)).toBeGreaterThan(0);
});

test("renders horizontal and vertical semantic dividers", async ({ page }) => {
  await page.goto(LAYOUT_URL);

  const divider = await page.getByTestId("divider-horizontal").evaluate((element) => getComputedStyle(element));
  const verticalDivider = await page.getByTestId("divider-vertical").evaluate((element) => getComputedStyle(element));

  expect(divider.borderTopWidth).not.toBe("0px");
  expect(divider.borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(verticalDivider.borderLeftWidth).not.toBe("0px");
  expect(verticalDivider.borderLeftColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("aligns a table's cells and caption to the inline start in either direction", async ({ page }) => {
  await page.goto(LAYOUT_URL);

  const alignment = await page.evaluate(() => {
    const read = (dir: string) => {
      const wrapper = document.createElement("div");
      wrapper.dir = dir;
      wrapper.style.width = "40rem";
      wrapper.innerHTML =
        '<table class="data-table"><caption>Caption</caption><thead><tr><th>Head</th><th>Head</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td></tr></tbody></table>';
      document.body.append(wrapper);

      const offset = (selector: string) => {
        const element = wrapper.querySelector(selector)!;
        const range = document.createRange();
        range.selectNodeContents(element);
        const text = range.getBoundingClientRect();
        const box = element.getBoundingClientRect();

        return dir === "rtl" ? box.right - text.right : text.left - box.left;
      };

      return { caption: offset("caption"), td: offset("td"), th: offset("th") };
    };

    return { ltr: read("ltr"), rtl: read("rtl") };
  });

  /* Text sits against the start edge -- within the cell's own padding -- in
     both directions, never pushed across the cell. */
  for (const direction of ["ltr", "rtl"] as const) {
    for (const part of ["caption", "th", "td"] as const) {
      expect(alignment[direction][part], `${direction} ${part}`).toBeLessThan(24);
    }
  }
});

/* A skip link is hidden until a keyboard reaches it, then shown where it
   stands; a group is shown while focus is anywhere inside it. */
test("shows a visually hidden focusable element while it or its content has focus", async ({ page }) => {
  await page.setContent(
    `<!doctype html><html><head><link rel="stylesheet" href="${ORIGIN}/shared/entry-vanilla.css" /></head><body><a class="visually-hidden-focusable" href="#main" data-testid="skip">Skip to content</a><div class="visually-hidden-focusable" data-testid="group"><a href="#a">First</a> <a href="#b">Second</a></div><main id="main">Main</main></body></html>`,
  );
  await page.waitForLoadState("load");

  const read = (id: string) =>
    page.getByTestId(id).evaluate((element) => {
      const computed = getComputedStyle(element);

      return { position: computed.position, width: element.getBoundingClientRect().width, overflow: computed.overflow };
    });

  const resting = { position: "absolute", width: 1, overflow: "hidden" };

  expect(await read("skip"), "the skip link at rest").toEqual(resting);
  expect(await read("group"), "the group at rest").toEqual(resting);

  // `focus()` rather than Tab: WebKit leaves links out of the tab order by default.
  await page.getByTestId("skip").focus();
  const skip = await read("skip");

  expect(skip.position, "the focused skip link").toBe("static");
  expect(skip.width, "the focused skip link").toBeGreaterThan(1);

  await page.getByTestId("group").getByRole("link", { name: "First" }).focus();
  expect((await read("skip")).width, "the skip link once focus leaves").toBe(1);
  const group = await read("group");

  expect(group.position, "the group while a link inside it has focus").toBe("static");
  expect(group.width, "the group while a link inside it has focus").toBeGreaterThan(1);
});

/* The bubble is placed against the `.tooltip` wrapper, so it is centred on the
   trigger only while the wrapper is the trigger's size. A layout that stretched
   the wrapper moved the bubble off its trigger: in a `.field` or a `.stack` a
   top bubble over a button centred on the full column, and in a row stretched
   by a taller sibling a right bubble sat level with the row's middle. Read in
   every layout helper, a grid, and a stretching flex row, at every placement,
   in either direction, from the compiled CSS and the Tailwind build. */
for (const [entry, url] of [
  ["dist", `${ORIGIN}/shared/entry-vanilla.css`],
  ["/tw", `${ORIGIN}/shared/entry-tw.css`],
] as const) {
  test(`centres a tooltip's bubble on its trigger in every layout, from ${entry}`, async ({ page }) => {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addStyleTag({ url });

    const layouts = {
      stack: '<div class="stack" style="width: 480px">',
      field: '<div class="field" style="width: 480px">',
      cluster: '<div class="cluster" style="width: 480px; height: 160px; align-items: stretch">',
      view: '<div class="view" style="width: 480px">',
      "view vertical": '<div class="view vertical" style="width: 480px">',
      "view horizontal": '<div class="view horizontal" style="width: 480px">',
      "auto-grid": '<div class="auto-grid" style="width: 480px">',
      grid: '<div style="display: grid; width: 480px; height: 160px">',
      "stretch row": '<div style="display: flex; width: 480px; height: 160px">',
    };
    const failures: string[] = [];

    for (const dir of ["ltr", "rtl"]) {
      for (const [layout, open] of Object.entries(layouts)) {
        for (const position of ["top", "bottom", "left", "right"]) {
          // oxlint-disable-next-line no-await-in-loop -- one layout on the page at a time.
          const read = await page.evaluate(
            ([markup, side, direction]) => {
              document.documentElement.dir = direction;
              document.body.innerHTML = `<div style="padding: 120px">${markup}<span class="tooltip" data-state="open" data-tooltip-position="${side}"><button class="btn">Save</button><span class="tooltip-bubble">Saves the draft</span></span><div style="height: 120px; width: 40px"></div></div></div>`;
              for (const animation of document.getAnimations()) {
                animation.finish();
              }

              const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
              const trigger = rect(".tooltip > .btn");
              const bubble = rect(".tooltip-bubble");

              return {
                vertical: side === "top" || side === "bottom",
                offset:
                  side === "top" || side === "bottom"
                    ? bubble.left + bubble.width / 2 - (trigger.left + trigger.width / 2)
                    : bubble.top + bubble.height / 2 - (trigger.top + trigger.height / 2),
                gap:
                  side === "top"
                    ? trigger.top - bubble.bottom
                    : side === "bottom"
                      ? bubble.top - trigger.bottom
                      : side === "left"
                        ? trigger.left - bubble.right
                        : bubble.left - trigger.right,
              };
            },
            [open, position, dir] as const,
          );
          const label = `${dir} ${layout} ${position}`;

          if (Math.abs(read.offset) > 1) {
            failures.push(`${label}: bubble ${read.offset.toFixed(1)}px off the trigger's centre`);
          }
          if (read.gap < 0 || read.gap > 16) {
            failures.push(`${label}: bubble ${read.gap.toFixed(1)}px from the trigger`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
}
