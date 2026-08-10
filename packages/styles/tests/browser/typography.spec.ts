import { expect, test } from "@playwright/test";

import { expectSameColor, getColorDistance, readSrgb } from "./test-utils";

const TYPOGRAPHY_URL = "http://localhost:5184/typography/?env=vanilla";

test("styles complete quiet tables while preserving table layout", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const table = getComputedStyle(document.querySelector('[data-testid="table"]')!);
    const caption = getComputedStyle(document.querySelector('[data-testid="table-caption"]')!);
    const heading = getComputedStyle(document.querySelector('[data-testid="table-heading"]')!);
    const cell = getComputedStyle(document.querySelector('[data-testid="table-cell"]')!);

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
    const quote = getComputedStyle(document.querySelector('[data-testid="quote-plain-none"]')!);
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
      inheritedRow: readIntent("table-row-inherited"),
      overriddenRow: readIntent("table-row-destructive"),
    };
  });

  expect(styles.inheritedRow).not.toBe("");
  expect(styles.inheritedRow).not.toBe(styles.overriddenRow);
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
      kbdDestructive: get("kbd-plain-destructive").color,
      kbdNeutral: get("kbd-plain-neutral").color,
      quoteInfo: get("quote-plain-info").borderLeftColor,
      tokenDestructiveStrong: resolveToken("destructive-strong"),
      tokenInfo: resolveToken("info"),
    };
  });

  expectSameColor(styles.kbdDestructive, styles.tokenDestructiveStrong, "kbd intent text");
  expect(getColorDistance(styles.kbdNeutral, styles.kbdDestructive)).toBeGreaterThan(2);
  expectSameColor(styles.quoteInfo, styles.tokenInfo, "quote intent rule");
});

test("reads presentation on key caps and tables", async ({ page }) => {
  await page.goto(TYPOGRAPHY_URL);

  const styles = await page.evaluate(() => {
    const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
    const head = getComputedStyle(document.querySelector('[data-testid="table-success"] thead th')!);
    const resolveToken = (tokenName: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--color-${tokenName})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

    return {
      flatBackground: get("kbd-flat-primary").backgroundColor,
      flatBorderColor: get("kbd-flat-primary").borderTopColor,
      flatColor: get("kbd-flat-primary").color,
      neutralBackground: get("kbd-plain-neutral").backgroundColor,
      outBorderWidth: get("kbd-out-primary").borderTopWidth,
      plainBorderColor: get("kbd-plain-neutral").borderTopColor,
      plainBorderWidth: get("kbd-plain-neutral").borderTopWidth,
      softBackground: get("kbd-soft-primary").backgroundColor,
      softBorderColor: get("kbd-soft-primary").borderTopColor,
      tableHeadBackground: head.backgroundColor,
      tokenBorder: resolveToken("border"),
      tokenPrimary: resolveToken("primary"),
      tokenSurface: resolveToken("surface"),
    };
  });

  // A plain key cap keeps the neutral surface tone.
  expectSameColor(styles.neutralBackground, styles.tokenSurface, "neutral kbd surface");
  // Each presentation moves it somewhere different.
  expect(getColorDistance(styles.softBackground, styles.neutralBackground)).toBeGreaterThan(2);
  expectSameColor(styles.flatBackground, styles.tokenPrimary, "flat kbd fill");
  expect(getColorDistance(styles.flatColor, styles.flatBackground)).toBeGreaterThan(2);
  expect(Number.parseFloat(styles.outBorderWidth)).toBeGreaterThan(Number.parseFloat(styles.plainBorderWidth));
  /* Only the default draws a visible line, and it is the quiet border color.
     `.out` keeps that line but doubles it, `.soft` drops it, and `.flat` lands
     on its own fill so a filled cap has no stray ring around it. */
  expectSameColor(styles.plainBorderColor, styles.tokenBorder, "plain kbd edge");
  expect(readSrgb(styles.softBorderColor).alpha, styles.softBorderColor).toBeLessThan(0.2);
  expectSameColor(styles.flatBorderColor, styles.flatBackground, "flat kbd edge");
  // A soft table tints its header away from the plain surface tone.
  expect(getColorDistance(styles.tableHeadBackground, styles.tokenSurface)).toBeGreaterThan(2);
});
