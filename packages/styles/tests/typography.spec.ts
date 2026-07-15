import { expect, test } from "@playwright/test";

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
    const quote = getComputedStyle(document.querySelector('[data-testid="quote"]')!);
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
