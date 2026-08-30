import { expect, test } from "./fixtures";

const PLAYGROUND_URL = "http://localhost:5184/";
const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";

test("links to each focused playground route", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const routes = ["/buttons/", "/forms/", "/feedback/", "/surfaces/", "/typography/", "/layout/", "/native/"];

  await Promise.all(
    routes.map((path) => expect(page.locator(`.playground-route[href="${path}"]`), path).toBeVisible()),
  );
});

test("puts the chosen aesthetic on the preview root and leaves the chrome alone", async ({ page }) => {
  await page.goto(`${BUTTONS_URL}&aesthetic=neobrutalism`);

  const root = page.getByTestId("preview-root");

  await expect(root).toHaveClass(/neobrutalism/);
  /* The nav is not part of what is being previewed: a stepped or translucent
     chrome makes it harder to read what actually changed. */
  await expect(page.locator(".playground-nav")).not.toHaveClass(/neobrutalism/);

  await page.getByTestId("aesthetic-select").selectOption("pixel");

  await expect(root).toHaveClass(/pixel/);
  await expect(root).not.toHaveClass(/neobrutalism/);
});

test("aligns narrow sections with the left edge every other section shares", async ({ page }) => {
  await page.goto("http://localhost:5184/forms/?env=vanilla");

  const edges = await page.evaluate(() => {
    const sections = [...document.querySelectorAll(".sect-inn")];

    return {
      lefts: [...new Set(sections.map((section) => Math.round(section.getBoundingClientRect().left)))],
      /* A narrow section still has to be narrower, or this passes for the wrong
         reason. */
      widths: [...new Set(sections.map((section) => Math.round(section.getBoundingClientRect().width)))],
    };
  });

  expect(edges.lefts).toHaveLength(1);
  expect(edges.widths.length).toBeGreaterThan(1);
});

test("renders a variant matrix from its spec", async ({ page }) => {
  await page.goto(BUTTONS_URL);

  /* One cell per intent per presentation, each addressable on its own, and every
     row names both halves of the presentation pair. */
  await expect(page.getByTestId("btn-default-primary")).toBeVisible();
  await expect(page.getByTestId("btn-ghost-edged-success")).toHaveClass(/btn success ghost edged/);
  await expect(page.getByTestId("btn-ghost-edgeless-destructive-disabled")).toBeDisabled();
});

test("keeps route cards compact", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const route = page.locator(".playground-route").first();
  await expect(route).toHaveCSS("justify-content", "normal");
  await expect(route).toHaveCSS("min-height", "auto");
});

test("uses circular icon controls for environment and theme", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const controls = [page.getByTestId("environment-toggle"), page.getByTestId("theme-toggle")];

  await Promise.all(
    controls.flatMap((control) => [
      expect(control.locator("svg")).toBeVisible(),
      expect(control).toHaveCSS("width", "40px"),
      expect(control).toHaveCSS("height", "40px"),
      expect(control).toHaveCSS("border-radius", "50%"),
    ]),
  );
});

test("centers navbar content with the playground sections", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const styles = await page.locator(".playground-nav-content").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const sectionBounds = document.querySelector(".sect-inn")!.getBoundingClientRect();

    return {
      inlineOffsetDifference: Math.abs(bounds.left - (window.innerWidth - bounds.right)),
      widthDifference: Math.abs(bounds.width - sectionBounds.width),
    };
  });

  expect(styles.inlineOffsetDifference).toBeLessThan(1);
  expect(styles.widthDifference).toBeLessThan(1);
});
