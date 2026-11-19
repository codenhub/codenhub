import { test as base, type BrowserContext, type Page } from "@playwright/test";

import { settleAnimations } from "./test-utils";

// Where each document keeps the stylesheet links that finished loading or failed.
const SHEETS_FINISHED = "__stylesheetsFinished";

/* Playwright gives every test its own browser context, which is the right
   default when tests carry state: cookies, storage, and permissions cannot
   leak between them. These tests carry none. They open a playground page,
   read computed styles, and assert on them, so the isolation a fresh context
   buys is isolation nothing here needs.

   It is not free. Creating a context costs each engine a different amount,
   and Firefox is an outlier: a fresh context followed by a first navigation
   measured ~2.6s against Chromium's ~0.3s, while a fresh page in a context
   that already exists costs Firefox ~0.4s. Across this suite's 164
   navigations that difference is the whole reason Firefox ran several times
   longer than the other engines.

   So the context is created once per worker and each test still gets its own
   page. A page is what the isolation these tests do rely on lives on:
   `page.emulateMedia` is page-scoped, and closing the page resets it along
   with the viewport, the document, and any listeners the test attached.

   A test that needs a context of its own should build one from `browser`
   rather than widening this fixture. */
/* `playground.js` is a real ES module, so it runs deferred -- after the
   document has parsed, right before `load` -- rather than synchronously
   mid-parse the way a classic script did. WebKit's `load` event does not
   reliably wait for a script-inserted stylesheet (`env-stylesheet.js`'s
   `document.write`d `<link>`) to finish being applied to computed style, and
   the classic script's much earlier execution used to leave enough headroom
   before `load` that the race never surfaced. `goto` now waits one settled
   paint past `load`, which is what actually closes the race -- confirmed by
   reproducing a transparent `document.body` background in WebKit until this
   wait was added, on a page whose stylesheet had already finished loading. */
export const test = base.extend<Record<string, unknown>, { sharedContext: BrowserContext }>({
  page: async ({ sharedContext }, use) => {
    const page = await sharedContext.newPage();
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    /* Every stylesheet link applied, a settled paint, then every finite
       animation and transition ended, so a test reads the page as a visitor
       sees it once it has loaded. A late sheet animates each transitioned
       property in from its initial value, which a read straight after `load`
       could catch partway. Infinite animations are left running.

       A link that failed has no sheet either, and its `error` may have fired
       before this runs, so a listener added now would wait out the test's
       timeout. Each document records the links that finished, either way, from
       its start; only a link still loading is waited on. */
    await page.addInitScript((key) => {
      const finished = new WeakSet<EventTarget>();

      (window as unknown as Record<string, WeakSet<EventTarget>>)[key] = finished;
      for (const type of ["load", "error"]) {
        document.addEventListener(
          type,
          (event) => {
            if (event.target instanceof HTMLLinkElement) {
              finished.add(event.target);
            }
          },
          true,
        );
      }
    }, SHEETS_FINISHED);
    const settle = async () => {
      await page.evaluate(async (key) => {
        const finished = (window as unknown as Record<string, WeakSet<EventTarget> | undefined>)[key];

        await Promise.all(
          [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
            .filter((link) => link.sheet === null && finished?.has(link) !== true)
            .map(
              (link) =>
                new Promise((resolve) => {
                  link.addEventListener("load", resolve, { once: true });
                  link.addEventListener("error", resolve, { once: true });
                }),
            ),
        );
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }, SHEETS_FINISHED);
      await settleAnimations(page);
    };

    page.goto = (async (...args: Parameters<Page["goto"]>) => {
      const response = await goto(...args);
      await settle();
      return response;
    }) as Page["goto"];
    // A reload loads the sheets again, so it waits the same way.
    page.reload = (async (...args: Parameters<Page["reload"]>) => {
      const response = await reload(...args);
      await settle();
      return response;
    }) as Page["reload"];

    await use(page);
    await page.close();
  },
  sharedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      /* The playground remembers the chosen theme and aesthetic in local
         storage, which belongs to the context rather than to the page. Left
         alone, a test that changes either hands its choice to whichever test
         the worker runs next, and that test reads a surface it never asked to
         restyle. Emptying it as each document starts costs no round trip and
         holds even when a test fails partway; no test here depends on a stored
         choice outliving a navigation. */
      await context.addInitScript(() => localStorage.clear());
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect, type Page } from "@playwright/test";
