import { expect, test } from "./fixtures";

const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";

/* A `box` on an element the intent reset does not name has no intent slots of
   its own. `--intent-border` used to be resolved at `:root`, where no aesthetic
   sets `--ui-ink`, so under `.neobrutalism` such a box drew the theme's grey line
   and a grey slab beside a `.neutral` sibling's black ink. */
test("draws a box with no intent in the aesthetic's ink", async ({ page }) => {
  await page.goto(BUTTONS_URL);

  const values = await page.evaluate(() => {
    const host = document.createElement("div");

    host.className = "neobrutalism";
    host.innerHTML =
      '<button class="box box-hover soft edged">Bare</button><button class="box box-hover soft edged neutral">Neutral</button>';
    document.body.append(host);

    const [bare, neutral] = [...host.children].map((element) => {
      const styles = getComputedStyle(element);

      return { line: styles.borderTopColor, shadow: styles.boxShadow };
    });

    host.remove();

    return { bare: bare!, neutral: neutral! };
  });

  expect(values.bare.line).toBe(values.neutral.line);
  expect(values.bare.shadow).toBe(values.neutral.shadow);
});
