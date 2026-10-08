import { expect, test } from "@playwright/test";

/*
 * `file` tells a `File` by the getters of `File.prototype` and `Blob.prototype`, `formData` reads a
 * `FormData` with the iterator of `FormData.prototype`, and `contentType` reads bytes with `slice` and
 * `arrayBuffer`. Each engine implements them itself, and a page receives them from other realms, such as an
 * iframe, whose prototypes are not the page's. So each engine is asked, for a value of the page and one of
 * an iframe, what Node.js answers in the unit tests. The probe is text, since this file is checked without
 * the types of a browser.
 */

const PROBE = `async () => {
  const { contentType, file, formData, object, optional, string } = globalThis.validation;
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const realms = { page: globalThis, frame: frame.contentWindow };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
  const answers = {};
  for (const [name, realm] of Object.entries(realms)) {
    const image = new realm.File([new realm.Uint8Array(png)], "a.png", { type: "image/png" });
    const fake = new realm.File(["<script>"], "a.png", { type: "image/png" });
    const form = new realm.FormData();
    form.append("name", "Ada");
    form.append("avatar", image);
    const avatar = file({ maxSize: 100, types: ["image/png"] }, contentType(["image/png"]));
    const profile = formData(object({ name: string({ min: 2 }), avatar: optional(avatar) }));
    const read = await profile(form);
    answers[name] = {
      image: (await avatar(image)).ok,
      fake: (await avatar(fake)).error?.issues[0]?.params?.content === true,
      blob: file()(new realm.Blob(["x"])).ok,
      form: read.ok && read.value.name === "Ada" && read.value.avatar === image,
      search: formData(object({}))(new realm.URLSearchParams("a=1")).ok,
    };
  }
  frame.remove();
  return answers;
}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/browser/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
});

test("files and forms of the page and of an iframe give the answers Node.js gives", async ({ page }) => {
  const expected = { image: true, fake: true, blob: false, form: true, search: false };
  expect(await page.evaluate(`(${PROBE})()`)).toEqual({ page: expected, frame: expected });
});
