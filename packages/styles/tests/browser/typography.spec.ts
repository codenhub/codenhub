import { expect, test } from "@playwright/test";

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
         out of it. */
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

    return { tokenForeground, values };
  });

  for (const row of rows.values) {
    expect(getColorDistance(row.hover, row.background), `${row.intent} hovered row`).toBeLessThanOrEqual(40);
    expect(getColorDistance(row.hover, rows.tokenForeground), `${row.intent} hovered row`).toBeGreaterThan(40);
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

/* A quote is still wave 2: it draws a left bar rather than a box, composing
   `--ui-fill` and `--ui-border` itself, and clamps the bar between one and four
   pixels. */
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
      bareEdgelessBorder: get("quote-bare-edgeless-primary").borderLeftColor,
      bareText: get("quote-bare-edged-primary").color,
      defaultBorderWidth: get("quote-default-primary").borderLeftWidth,
      edgedBorderWidth: get("quote-bare-edged-primary").borderLeftWidth,
      softBackground: get("quote-soft-edged-primary").backgroundColor,
      softEdgedBorder: get("quote-soft-edged-primary").borderLeftColor,
      softEdgelessBorder: get("quote-soft-edgeless-primary").borderLeftColor,
      solidBackground: get("quote-solid-primary").backgroundColor,
      solidColor: get("quote-solid-primary").color,
      strongPrimary: resolveToken("primary-strong"),
    };
  });

  expect(isTransparent(styles.bareEdgelessBorder)).toBe(true);
  expectSameColor(styles.bareText, styles.strongPrimary, "bare quote intent text");
  /* The fill has to be non-zero for this to mean anything. A bare edgeless bar
     is transparent under a wrong edge blend too, because there is no fill for a
     wrong one to leave behind -- so the assertion above passed while a soft
     edgeless quotation drew a bar of its own tint over the tint it had already
     painted. `.edgeless` means no bar at every fill, not only at zero. */
  expect(isTransparent(styles.softEdgelessBorder)).toBe(true);
  expect(isTransparent(styles.softEdgedBorder)).toBe(false);
  expect(isTransparent(styles.softBackground)).toBe(false);
  expect(isTransparent(styles.solidBackground)).toBe(false);
  expect(getColorDistance(styles.solidColor, styles.solidBackground)).toBeGreaterThan(2);
  /* The bar is clamped between one and four pixels, and no presentation scales
     it: `.edged` decides whether the bar reads, never how wide it is. */
  expect(Number.parseFloat(styles.defaultBorderWidth)).toBeGreaterThanOrEqual(1);
  expect(Number.parseFloat(styles.edgedBorderWidth)).toBeLessThanOrEqual(4);
  expect(styles.edgedBorderWidth).toBe(styles.defaultBorderWidth);
});

test("reads presentation on key caps and tables", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
    const head = getComputedStyle(document.querySelector('[data-testid="data-table-success"] thead th')!);
    const resolveToken = (tokenName: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--color-${tokenName})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

    return {
      defaultBorderColor: get("kbd-default-neutral").borderTopColor,
      defaultBorderWidth: get("kbd-default-neutral").borderTopWidth,
      edgedBorderWidth: get("kbd-bare-edged-primary").borderTopWidth,
      neutralBackground: get("kbd-default-neutral").backgroundColor,
      softBackground: get("kbd-soft-edgeless-primary").backgroundColor,
      softBorderColor: get("kbd-soft-edgeless-primary").borderTopColor,
      solidBackground: get("kbd-solid-primary").backgroundColor,
      solidBorderColor: get("kbd-solid-primary").borderTopColor,
      solidColor: get("kbd-solid-primary").color,
      tableHeadBackground: head.backgroundColor,
      tokenBorder: resolveToken("border"),
      tokenPrimary: resolveToken("primary"),
      tokenSurface: resolveToken("surface"),
    };
  });

  // A key cap with no presentation class keeps the neutral surface tone.
  expectSameColor(styles.neutralBackground, styles.tokenSurface, "neutral kbd surface");
  // Each fill moves it somewhere different.
  expect(getColorDistance(styles.softBackground, styles.neutralBackground)).toBeGreaterThan(2);
  expectSameColor(styles.solidBackground, styles.tokenPrimary, "solid kbd fill");
  expect(getColorDistance(styles.solidColor, styles.solidBackground)).toBeGreaterThan(2);
  /* A key cap caps its border at the base width, so a thicker aesthetic cannot
     turn a chip into a box with a label in it. No presentation scales it either,
     so `.edged` matches the default rather than doubling it. */
  expect(Number.parseFloat(styles.edgedBorderWidth)).toBe(Number.parseFloat(styles.defaultBorderWidth));
  expect(Number.parseFloat(styles.edgedBorderWidth)).toBeLessThanOrEqual(1);
  /* The default draws the quiet border colour; `.edgeless` drops the line, and a
     filled cap lands on its own fill so nothing rings it. */
  expectSameColor(styles.defaultBorderColor, styles.tokenBorder, "default kbd edge");
  expect(readSrgb(styles.softBorderColor).alpha, styles.softBorderColor).toBeLessThan(0.2);
  expectSameColor(styles.solidBorderColor, styles.solidBackground, "solid kbd edge");
  // A soft table tints its header away from the plain surface tone.
  expect(getColorDistance(styles.tableHeadBackground, styles.tokenSurface)).toBeGreaterThan(2);
});
