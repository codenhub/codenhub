import { expect, test } from "@playwright/test";

import { expectSameColor } from "./test-utils";

const NATIVE_URL = "http://localhost:5184/native/?env=vanilla";

test("maps content utilities onto unclassed native elements", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const styles = await page.evaluate(() => ({
    dividerBorder: getComputedStyle(document.querySelector("hr")!).borderTopWidth,
    keyboardBorder: getComputedStyle(document.querySelector("kbd")!).borderTopWidth,
    quoteBorder: getComputedStyle(document.querySelector("blockquote")!).borderLeftWidth,
    tableCollapse: getComputedStyle(document.querySelector("table")!).borderCollapse,
  }));

  expect(styles.dividerBorder).not.toBe("0px");
  expect(styles.keyboardBorder).not.toBe("0px");
  expect(styles.quoteBorder).not.toBe("0px");
  expect(styles.tableCollapse).toBe("separate");
});

test("includes package reset behavior in the native entrypoint", async ({ page }) => {
  await page.goto(NATIVE_URL);

  await expect(page.getByTestId("native-root")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("display", "flex");
  await expect(page.locator("body")).toHaveCSS("min-height", "720px");
});

test("avoids inline code decoration inside native preformatted blocks", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const code = page.getByTestId("native-pre-code");
  await expect(code).toBeVisible();
  await expect(code).toHaveCSS("padding", "0px");
  await expect(code).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("styles native forms and buttons without utility classes", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const input = page.locator('input[type="text"]');
  const button = page.getByRole("button", { name: "button element" });
  const inputStyles = await input.evaluate((element) => {
    const styles = getComputedStyle(element);

    return {
      borderColor: styles.borderTopColor,
      borderStyle: styles.borderTopStyle,
      borderWidth: styles.borderTopWidth,
      token: styles.getPropertyValue("--border-width").trim(),
    };
  });

  await expect(input).toHaveCSS("min-height", "40px");
  expect(inputStyles.token).toBe("1px");
  expect(inputStyles.borderStyle).toBe("solid");
  expect(inputStyles.borderWidth).toBe("1px");
  expect(inputStyles.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  await expect(button).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(button).not.toHaveCSS("border-radius", "0px");
});

test("adds default icons and position modifiers to native inputs", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const emailInput = page.locator("#native-email");
  const emailRightInput = page.locator("#native-email-right");
  const searchNoIconInput = page.locator("#native-search-noicon");

  const emailBg = await emailInput.evaluate((el) => getComputedStyle(el).backgroundImage);
  const emailRightPos = await emailRightInput.evaluate((el) => getComputedStyle(el).backgroundPosition);
  const searchNoIconBg = await searchNoIconInput.evaluate((el) => getComputedStyle(el).backgroundImage);

  expect(emailBg).not.toBe("none");
  expect(emailBg).toContain("data:image/svg+xml");
  expect(emailRightPos).toContain("100%");
  expect(searchNoIconBg).toBe("none");
});

/* `native.css` re-declares border and background after `@apply`, which would
   defeat the intent contract if those declarations outranked the utilities.
   They sit in the base layer and the utilities win, so intent still reaches
   classless elements; this pins that ordering down. */
test("applies intent classes to classless native elements", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const styles = await page.evaluate(() => {
    const resolveToken = (tokenName: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--color-${tokenName})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

    const host = document.createElement("div");
    host.innerHTML = `
      <button class="destructive">Delete</button>
      <button>Plain</button>
      <input type="text" class="success" />
      <kbd class="warning">K</kbd>
    `;
    document.body.append(host);

    const values = {
      inputBorder: getComputedStyle(host.querySelector("input")!).borderTopColor,
      intentButtonBg: getComputedStyle(host.querySelector("button.destructive")!).backgroundColor,
      keyboardText: getComputedStyle(host.querySelector("kbd")!).color,
      plainButtonBg: getComputedStyle(host.querySelector("button:not(.destructive)")!).backgroundColor,
      tokenDestructive: resolveToken("destructive"),
      tokenSuccess: resolveToken("success"),
      tokenText: resolveToken("text"),
      tokenWarningStrong: resolveToken("warning-strong"),
    };

    host.remove();

    return values;
  });

  expectSameColor(styles.intentButtonBg, styles.tokenDestructive, "native button intent background");
  expectSameColor(styles.plainButtonBg, styles.tokenText, "native button neutral background");
  expectSameColor(styles.inputBorder, styles.tokenSuccess, "native input intent border");
  expectSameColor(styles.keyboardText, styles.tokenWarningStrong, "native kbd intent text");
});
