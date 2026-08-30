import { expect, test } from "./fixtures";
import {
  expectSameColor,
  flattenColor,
  getColorDistance,
  getContrastRatio,
  isTransparent,
  readSrgb,
} from "./test-utils";

const TYPOGRAPHY_URL = "http://localhost:5184/typography/?env=vanilla";

test("styles complete quiet tables while preserving table layout", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const table = getComputedStyle(document.querySelector('[data-testid="data-table"]')!);
    const caption = getComputedStyle(document.querySelector('[data-testid="data-table-caption"]')!);
    const heading = getComputedStyle(document.querySelector('[data-testid="data-table-heading"]')!);
    const cell = getComputedStyle(document.querySelector('[data-testid="data-table-cell"]')!);

    return {
      borderCollapse: table.borderCollapse,
      captionAlign: caption.textAlign,
      cellPadding: cell.paddingInline,
      headingWeight: heading.fontWeight,
      overflow: table.overflow,
      radius: table.borderRadius,
      tableDisplay: table.display,
    };
  });

  expect(styles.tableDisplay).toBe("table");
  expect(styles.borderCollapse).toBe("separate");
  expect(styles.captionAlign).toBe("left");
  expect(Number.parseFloat(styles.cellPadding)).toBeGreaterThan(0);
  expect(Number(styles.headingWeight)).toBeGreaterThanOrEqual(500);
  expect(styles.overflow).toBe("hidden");
  expect(styles.radius).toBe("8px");
});

test("styles keyboard and quotation content", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const keyboard = getComputedStyle(document.querySelector('[data-testid="keyboard"]')!);
    const quote = getComputedStyle(document.querySelector('[data-testid="quote-default-none"]')!);
    const inlineQuote = getComputedStyle(document.querySelector('[data-testid="quote-inline"]')!);

    return {
      inlineQuoteStyle: inlineQuote.fontStyle,
      keyboardBorder: keyboard.borderTopWidth,
      keyboardFamily: keyboard.fontFamily,
      quoteBorder: quote.borderLeftWidth,
    };
  });

  expect(styles.keyboardBorder).not.toBe("0px");
  expect(styles.keyboardFamily.toLowerCase()).toContain("mono");
  expect(styles.quoteBorder).not.toBe("0px");
  expect(styles.inlineQuoteStyle).toBe("italic");
});

/* The attribution follows the quotation rather than carrying a tone of its own.
   Asserting the two match is what keeps them from drifting apart again: pinned
   to the secondary text tone, a cite sat at 1.00:1 on a filled quote in dark
   theme -- the same colour as the ground it was printed on -- while the line
   above it had moved to the contrast tone. */
test("prints a quotation's attribution in the quotation's own colour", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const quotes = await page.evaluate(() =>
    [...document.querySelectorAll(".quote")]
      .filter((quote) => quote.querySelector("cite"))
      .map((quote) => {
        const quoteStyles = getComputedStyle(quote);

        return {
          background: quoteStyles.backgroundColor,
          cite: getComputedStyle(quote.querySelector("cite")!).color,
          label: quote.className,
          page: getComputedStyle(document.body).backgroundColor,
          quote: quoteStyles.color,
          solid: quote.classList.contains("solid"),
        };
      }),
  );

  expect(quotes.length).toBeGreaterThan(0);

  for (const quote of quotes) {
    expectSameColor(quote.cite, quote.quote, `${quote.label} cite`);
  }

  /* A filled quotation is the case the pin broke. Its ground is not necessarily
     opaque -- a neutral fill stops at its intent's cap -- so the ratio is taken
     against the ground composited over the page, which is what a reader sees.
     The threshold is the 3:1 the filled components are held to elsewhere. */
  const filled = quotes.filter((quote) => quote.solid);
  expect(filled.length).toBeGreaterThan(0);

  for (const quote of filled) {
    const ground = flattenColor(quote.background, quote.page);
    expect(getContrastRatio(quote.cite, ground), `${quote.label} cite`).toBeGreaterThanOrEqual(3);
  }
});

/* Intent cascades nowhere except into table rows, because a row is part of the
   table rather than an independent component. */
test("lets a table row override the table intent while others inherit it", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const readIntent = (testId: string) =>
      getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!)
        .getPropertyValue("--intent-color")
        .trim();

    return {
      inheritedRow: readIntent("data-table-row-inherited"),
      overriddenRow: readIntent("data-table-row-destructive"),
    };
  });

  expect(styles.inheritedRow).not.toBe("");
  expect(styles.inheritedRow).not.toBe(styles.overriddenRow);
});

/* Three positions from one token, and the point of the switch is that none of
   them arrives by implication: a table nobody classed draws the boundaries that
   separate its parts and nothing else, and both of the other answers are asked
   for by name. Painted-ness is read off the border colour rather than its width,
   because every cell carries the hairline at every setting -- what varies is
   whether it is painted, and a test on the width would pass on a table with no
   visible line in it. */
test("draws table rules only where they are asked for", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const tables = await page.evaluate(() => {
    const host = document.createElement("div");
    document.body.append(host);

    const markup = (classes: string) =>
      `<table class="data-table ${classes}"><thead><tr><th>H</th></tr></thead>` +
      "<tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot></table>";

    host.innerHTML = [
      `<div data-case="plain">${markup("")}</div>`,
      `<div data-case="ruled">${markup("ruled")}</div>`,
      `<div data-case="ruleless">${markup("ruleless edged")}</div>`,
      `<div data-case="region" style="--ui-rule: 100%">${markup("")}</div>`,
    ].join("");

    const read = (name: string) => {
      const table = host.querySelector(`[data-case="${name}"] table`)!;
      const at = (selector: string, property: string) =>
        getComputedStyle(table.querySelector(selector)!).getPropertyValue(property);

      return {
        bodyRule: at("tbody td", "border-bottom-color"),
        footBoundary: at("tfoot td", "border-top-color"),
        frame: getComputedStyle(table).borderTopColor,
        headBoundary: at("thead th", "border-bottom-color"),
      };
    };

    const values = {
      plain: read("plain"),
      region: read("region"),
      ruled: read("ruled"),
      ruleless: read("ruleless"),
    };

    host.remove();

    return values;
  });

  const painted = (color: string) => readSrgb(color).alpha > 0;

  /* Unclassed: the two boundaries, and no rules between rows. */
  expect(painted(tables.plain.headBoundary), "plain head boundary").toBe(true);
  expect(painted(tables.plain.footBoundary), "plain foot boundary").toBe(true);
  expect(painted(tables.plain.bodyRule), "plain body rule").toBe(false);

  /* `.ruled` adds the rows and keeps the boundaries. */
  expect(painted(tables.ruled.headBoundary), "ruled head boundary").toBe(true);
  expect(painted(tables.ruled.footBoundary), "ruled foot boundary").toBe(true);
  expect(painted(tables.ruled.bodyRule), "ruled body rule").toBe(true);

  /* `.ruleless` takes every line inside the table and leaves the frame alone --
     the edge axis answers for that, not this switch. The fixture asks for a frame
     with `.edged`, which is also the proof that the two switches do not reach each
     other: the table has a frame and no lines inside it. */
  expect(painted(tables.ruleless.headBoundary), "ruleless head boundary").toBe(false);
  expect(painted(tables.ruleless.footBoundary), "ruleless foot boundary").toBe(false);
  expect(painted(tables.ruleless.bodyRule), "ruleless body rule").toBe(false);
  expect(painted(tables.ruleless.frame), "ruleless frame").toBe(true);

  /* The token is the same switch, so a container answers for a whole region. */
  expect(painted(tables.region.bodyRule), "region-ruled body rule").toBe(true);
});

/* The rule that ends a table comes off the row that is visually last, and with a
   footer that is not the last row of the body. Written the other way it deleted
   the body/footer boundary and left the footer's own bottom rule drawing a
   hairline inside the frame -- invisible for as long as `thead` and `tfoot` shared
   an unconditional plate, and plain the moment `.ghost` stopped drawing one.

   Both fixtures are `.ruled`, because that is the setting where body rules are
   painted and therefore the only one where the question has an answer to see. */
test("ends a table after its footer rather than after its body", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const tables = await page.evaluate(() => {
    const rules = (table: Element) =>
      [...table.querySelectorAll("tr")].map((row) => ({
        color: getComputedStyle(row.querySelector("th, td")!).borderBottomColor,
        section: row.closest("thead, tbody, tfoot")!.tagName,
        width: getComputedStyle(row.querySelector("th, td")!).borderBottomWidth,
      }));

    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML =
      '<table class="data-table ruled" data-case="foot"><thead><tr><th>H</th></tr></thead>' +
      "<tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody><tfoot><tr><td>f</td></tr></tfoot></table>" +
      '<table class="data-table ruled" data-case="no-foot"><thead><tr><th>H</th></tr></thead>' +
      "<tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table>";

    const values = {
      withFoot: rules(host.querySelector('[data-case="foot"]')!),
      withoutFoot: rules(host.querySelector('[data-case="no-foot"]')!),
    };

    host.remove();

    return values;
  });

  const ends = (rows: { color: string; width: string }[]) =>
    rows.map((row) => Number.parseFloat(row.width) > 0 && readSrgb(row.color).alpha > 0);

  /* Every row draws one except the last -- and in the first shape the last row is
     the footer's, so the body keeps the boundary that separates the two. */
  expect(ends(tables.withFoot), "table with a footer").toEqual([true, true, true, false]);
  expect(tables.withFoot.at(-1)?.section, "the row that ends a footed table").toBe("TFOOT");
  expect(ends(tables.withoutFoot), "table without a footer").toEqual([true, true, false]);
  expect(tables.withoutFoot.at(-1)?.section, "the row that ends a footless table").toBe("TBODY");
});

/* A hovered row used to mix into `--color-foreground`, a tone the page owns and
   the table may not be wearing. On a solid table -- whose body is the intent --
   that put a near-black band across a white table. The step is relative now, so
   the assertion is relative too: a hovered row stays near its own table and well
   away from the page tone it used to land on. */
test("steps a hovered table row from its own table rather than the page", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const rows = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="data-table"]')!;
    const host = document.createElement("div");
    document.body.append(host);

    const read = (intent: string) => {
      const clone = table.cloneNode(true) as HTMLElement;
      clone.className = `data-table solid ${intent}`;
      host.append(clone);
      /* `--table-row-hover` is a `color-mix()` over `var()`s, so reading the
         property gives back its text rather than a colour. It resolves on the
         table, so a probe inside one reports the value the row actually gets --
         and it goes in a cell, because a stray span in a `<table>` is hoisted
         out of it. The probe also has to inherit the table's ink, because the
         step is drawn in `currentColor` wherever the plate is filled. */
      const probe = document.createElement("span");
      probe.style.color = "var(--table-row-hover)";
      clone.querySelector("td")!.append(probe);

      const values = {
        background: getComputedStyle(clone).backgroundColor,
        hover: getComputedStyle(probe).color,
        intent,
      };
      clone.remove();
      return values;
    };

    const values = ["primary", "secondary", "neutral"].map(read);

    const probe = document.createElement("span");
    probe.style.color = "var(--color-foreground)";
    document.body.append(probe);
    const tokenForeground = getComputedStyle(probe).color;
    probe.remove();
    host.remove();

    return { page: getComputedStyle(document.body).backgroundColor, tokenForeground, values };
  });

  for (const row of rows.values) {
    /* Both values are painted rather than final: a capped fill leaves the plate
       translucent over the page, and the hover is translucent over the plate --
       which is the whole point, since compositing is what makes the step
       relative to the table instead of to a tone the page owns. Flattening in
       that order is what the pixels do. */
    const plate = flattenColor(row.background, rows.page);
    const painted = flattenColor(row.hover, plate);

    expect(getColorDistance(painted, plate), `${row.intent} hovered row moves`).toBeGreaterThan(2);
    expect(getColorDistance(painted, plate), `${row.intent} hovered row stays near its table`).toBeLessThanOrEqual(40);
    /* The bug this test was written for: mixed into `--color-foreground` the step
       was absolute, so a solid primary table in the dark theme is white and its
       hovered row came out near-black. */
    expect(getColorDistance(painted, rows.tokenForeground), `${row.intent} hovered row`).toBeGreaterThan(40);
  }
});

test("colors key caps and quotes by intent", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
    const resolveToken = (tokenName: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--color-${tokenName})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

    return {
      kbdDestructive: get("kbd-default-destructive").color,
      kbdNeutral: get("kbd-default-neutral").color,
      quoteInfo: get("quote-default-info").borderLeftColor,
      tokenDestructiveStrong: resolveToken("destructive-strong"),
      tokenInfo: resolveToken("info"),
    };
  });

  expectSameColor(styles.kbdDestructive, styles.tokenDestructiveStrong, "kbd intent text");
  expect(getColorDistance(styles.kbdNeutral, styles.kbdDestructive)).toBeGreaterThan(2);
  expectSameColor(styles.quoteInfo, styles.tokenInfo, "quote intent rule");
});

/* A quote draws a left bar rather than a box and composes `--ui-fill` and
   `--ui-border` itself. */
test("renders every block quote presentation", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
    const resolveToken = (tokenName: string) => {
      const probe = document.createElement("span");

      probe.style.color = `var(--color-${tokenName})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();

      return color;
    };

    return {
      ghostEdgelessBorder: get("quote-ghost-edgeless-primary").borderLeftColor,
      ghostText: get("quote-ghost-edged-primary").color,
      defaultBorderWidth: get("quote-default-primary").borderLeftWidth,
      edgedBorderWidth: get("quote-ghost-edged-primary").borderLeftWidth,
      softBackground: get("quote-soft-edged-primary").backgroundColor,
      softEdgedBorder: get("quote-soft-edged-primary").borderLeftColor,
      softEdgelessBorder: get("quote-soft-edgeless-primary").borderLeftColor,
      solidBackground: get("quote-solid-primary").backgroundColor,
      solidColor: get("quote-solid-primary").color,
      strongPrimary: resolveToken("primary-strong"),
    };
  });

  expect(isTransparent(styles.ghostEdgelessBorder)).toBe(true);
  expectSameColor(styles.ghostText, styles.strongPrimary, "ghost quote intent text");
  /* The fill has to be non-zero for this to mean anything. A ghost edgeless bar
     is transparent under a wrong edge blend too, because there is no fill for a
     wrong one to leave behind -- so the assertion above passed while a soft
     edgeless quotation drew a bar of its own tint over the tint it had already
     painted. `.edgeless` means no bar at every fill, not only at zero. */
  expect(isTransparent(styles.softEdgelessBorder)).toBe(true);
  expect(isTransparent(styles.softEdgedBorder)).toBe(false);
  expect(isTransparent(styles.softBackground)).toBe(false);
  expect(isTransparent(styles.solidBackground)).toBe(false);
  expect(getColorDistance(styles.solidColor, styles.solidBackground)).toBeGreaterThan(2);
  /* No presentation scales the bar: `.edged` decides whether it reads, never
     how wide it is. */
  expect(Number.parseFloat(styles.defaultBorderWidth)).toBeGreaterThanOrEqual(1);
  expect(styles.edgedBorderWidth).toBe(styles.defaultBorderWidth);
});

test("reads presentation on key caps and tables", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
    /* The plate is on `thead`, not on the cells inside it. Read off a `th` this
       reports `rgba(0, 0, 0, 0)` for every table there has ever been, which is a
       green assertion about nothing. */
    const head = getComputedStyle(document.querySelector('[data-testid="data-table-success"] thead')!);
    /* Classed `.ghost` on purpose: the component rests at `soft`, so an unclassed
       table draws the plate and `.ghost` is what asks for none. */
    const ghost = document.querySelector('[data-testid="data-table"]')!.cloneNode(true) as HTMLElement;
    ghost.className = "data-table ghost";
    document.body.append(ghost);
    const ghostHead = getComputedStyle(ghost.querySelector("thead")!);
    const resolve = (value: string) => {
      const probe = document.createElement("span");

      probe.style.color = value;
      document.body.append(probe);

      const color = getComputedStyle(probe).color;

      probe.remove();

      return color;
    };
    const resting = get("kbd-default-neutral");

    const values = {
      defaultBorderColor: resting.borderTopColor,
      defaultBorderWidth: resting.borderTopWidth,
      edgedBorderWidth: get("kbd-soft-edged-primary").borderTopWidth,
      /* The line `box` composes for a chip at its resting fill: the neutral line
         blended toward the plate it rings by that fill. Restated here rather than
         approximated, so the assertion still names a colour. */
      expectedBorderColor: resolve(`color-mix(in oklab, ${resting.backgroundColor} 12%, var(--color-border))`),
      ghostHeadBackground: ghostHead.backgroundColor,
      restingBackground: resting.backgroundColor,
      softBackground: get("kbd-soft-edgeless-primary").backgroundColor,
      softBorderColor: get("kbd-soft-edgeless-primary").borderTopColor,
      solidBackground: get("kbd-solid-primary").backgroundColor,
      solidBorderColor: get("kbd-solid-primary").borderTopColor,
      solidColor: get("kbd-solid-primary").color,
      tableHeadBackground: head.backgroundColor,
      tokenPrimary: resolve("var(--color-primary)"),
      tokenSurface: resolve("var(--color-surface)"),
    };

    ghost.remove();

    return values;
  });

  /* A key cap rests `soft`, not `ghost`. `.ghost` is published as unsupported on
     the three content chips: the ground draws the plate whatever the fill says,
     so a ghost chip was `--intent-subtle` alone -- #e5e5e5 for neutral and
     primary alike on the light page, and #f5f5f5 at 1.04:1 against it for
     secondary. A real 12% of the intent over the same ground is what separates
     them, and it is a visible step past the surface tone the chip sits on. */
  expect(
    getColorDistance(styles.restingBackground, styles.tokenSurface),
    "a resting key cap steps past the surface tone",
  ).toBeGreaterThan(2);
  // Each supported fill moves it somewhere different.
  expect(getColorDistance(styles.solidBackground, styles.softBackground)).toBeGreaterThan(2);
  expectSameColor(styles.solidBackground, styles.tokenPrimary, "solid kbd fill");
  expect(getColorDistance(styles.solidColor, styles.solidBackground)).toBeGreaterThan(2);
  /* No presentation scales a key cap's border, so `.edged` matches the default
     rather than changing its width. */
  expect(Number.parseFloat(styles.edgedBorderWidth)).toBe(Number.parseFloat(styles.defaultBorderWidth));
  // The resting line is the neutral line, blended toward its own plate.
  expectSameColor(styles.defaultBorderColor, styles.expectedBorderColor, "default kbd edge");
  /* `.edgeless` drops the line, and a filled cap lands on its own fill so nothing
     rings it -- the edge blend runs the line to the plate at a full fill. A fill
     class decides no edge of its own. */
  expect(readSrgb(styles.softBorderColor).alpha, styles.softBorderColor).toBeLessThan(0.2);
  expectSameColor(styles.solidBorderColor, styles.solidBackground, "solid kbd edge");
  /* A ghost table draws no head plate at all -- that is what `.ghost` means on
     this component -- while a soft one tints it away from the surface tone. */
  expect(isTransparent(styles.ghostHeadBackground), "ghost table head").toBe(true);
  expect(getColorDistance(styles.tableHeadBackground, styles.tokenSurface)).toBeGreaterThan(2);
});
