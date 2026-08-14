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

/* A native mapping gives the control and stops there. An icon needs a `.control`
   wrapper to paint into and a bare element has no wrapper by definition, so the
   artwork is opt-in: wrap the control and write `.icon`. A mapping that guessed
   would reserve space on every typed input on the page. */
test("paints a native input icon only where the author opted in", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const icons = await page.evaluate(() => {
    const readWrapper = (id: string) => {
      const styles = getComputedStyle(document.querySelector(`#${id}`)!.closest(".control")!, "::before");

      return {
        content: styles.content,
        inlineEnd: styles.insetInlineEnd,
        inlineStart: styles.insetInlineStart,
        mask: styles.maskImage || styles.getPropertyValue("-webkit-mask-image"),
      };
    };

    return {
      bare: getComputedStyle(document.querySelector("#native-search-noicon")!).backgroundImage,
      left: readWrapper("native-email"),
      right: readWrapper("native-email-right"),
      wrapped: document.querySelector("#native-search-noicon")!.closest(".control"),
    };
  });

  expect(icons.wrapped, "the opt-out input has no wrapper").toBeNull();
  expect(icons.bare, "an unwrapped input paints no artwork").toBe("none");
  expect(icons.left.mask, "wrapped artwork").toContain("data:image/svg+xml");
  expect(icons.left.inlineStart, "left position").not.toBe("auto");
  expect(icons.right.inlineEnd, "right position").not.toBe("auto");
  expect(icons.right.mask, "right artwork is the same picture moved").toBe(icons.left.mask);
});

/* `native.css` re-declares border and background after `@apply`, which would
   defeat the intent contract if those declarations outranked the utilities.
   They sit in the base layer and the utilities win, so intent still reaches
   classless elements; this pins that ordering down. */
test("applies intent classes to classless native elements", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const styles = await page.evaluate(() => {
    const resolveColor = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    const resolveToken = (tokenName: string) => resolveColor(`var(--color-${tokenName})`);

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
      neutralFill: resolveColor(
        `color-mix(in oklab, var(--color-text) ${getComputedStyle(host.querySelector("button:not(.destructive)")!).getPropertyValue("--intent-fill-max").trim()}, transparent)`,
      ),
      tokenDestructive: resolveToken("destructive"),
      tokenSuccess: resolveToken("success"),
      tokenWarningStrong: resolveToken("warning-strong"),
    };

    host.remove();

    return values;
  });

  expectSameColor(styles.intentButtonBg, styles.tokenDestructive, "native button intent background");
  /* A `<button>` nobody has styled is the most visible element in the package, and
     the neutral cap is what keeps it a quiet plate instead of a slab of ink. */
  expectSameColor(styles.plainButtonBg, styles.neutralFill, "native button neutral background");
  expectSameColor(styles.inputBorder, styles.tokenSuccess, "native input intent border");
  expectSameColor(styles.keyboardText, styles.tokenWarningStrong, "native kbd intent text");
});
