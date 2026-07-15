import { expect, test } from "@playwright/test";

const LAYOUT_URL = "http://localhost:5184/layout/?env=vanilla";

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
