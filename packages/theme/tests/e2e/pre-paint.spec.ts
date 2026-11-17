import { expect, test, type Page } from "@playwright/test";

// The built output, the bytes consumers install; `hub test:browser` builds before it runs.
import { createTheme } from "../../dist/index.js";

const origin = "http://localhost:5186";
const pagePath = "/pre-paint.html";

const prePaintScript = createTheme({
  themes: {
    light: { colorScheme: "light", tokens: { primary: "rgb(1, 2, 3)" } },
    dark: { colorScheme: "dark", tokens: { primary: "rgb(4, 5, 6)" } },
  },
  tokenSchema: { primary: "--color-primary" },
  darkClass: true,
}).getPrePaintScript();

// The second script runs before <body> exists, so what it records is what the first paint shows.
const html = `<!doctype html>
<html lang="en">
  <head>
    <script>${prePaintScript}</script>
    <script>
      var root = document.documentElement;
      window.beforeBody = {
        hasBody: document.body !== null,
        theme: root.getAttribute("data-theme"),
        className: root.className,
        colorScheme: root.style.colorScheme,
        primary: getComputedStyle(root).getPropertyValue("--color-primary").trim(),
      };
    </script>
  </head>
  <body></body>
</html>`;

interface BeforeBody {
  hasBody: boolean;
  theme: string | null;
  className: string;
  colorScheme: string;
  primary: string;
}

const openPrePaintPage = async (page: Page, storedTheme: string | null): Promise<BeforeBody> => {
  await page.route(`${origin}${pagePath}`, (route) => route.fulfill({ contentType: "text/html", body: html }));
  // Storage is per origin, so it is set on the same origin the pre-paint page is served from.
  await page.goto(`${origin}${pagePath}`);
  await page.evaluate((stored) => {
    localStorage.clear();
    if (stored !== null) {
      localStorage.setItem("app-theme-preference", stored);
    }
  }, storedTheme);
  await page.reload();
  return page.evaluate(() => (window as unknown as { beforeBody: BeforeBody }).beforeBody);
};

test.describe("Pre-paint script in a real browser", () => {
  test("applies the stored theme, its classes, and its tokens before the body is parsed", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });

    const state = await openPrePaintPage(page, "dark");

    expect(state).toEqual({
      hasBody: false,
      theme: "dark",
      className: "theme-dark dark",
      colorScheme: "dark",
      primary: "rgb(4, 5, 6)",
    });
  });

  test("follows the operating system when nothing is stored", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });

    const state = await openPrePaintPage(page, null);

    expect(state.theme).toBe("dark");
    expect(state.primary).toBe("rgb(4, 5, 6)");
  });

  test("ignores a stored name that is not a configured theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });

    const state = await openPrePaintPage(page, "sepia");

    expect(state.theme).toBe("light");
    expect(state.className).toBe("theme-light");
    expect(state.primary).toBe("rgb(1, 2, 3)");
  });
});
