import type { ErrorFeedback } from "@codenhub/error";
import { expect, it } from "vitest";

import { storeErrors } from "../index";
import type { StoreErrorEvent } from "../index";

const expected: Record<StoreErrorEvent["code"], true> = {
  "store.read_failed": true,
  "store.write_failed": true,
  "store.clear_failed": true,
  "store.clear_unsupported": true,
  "store.parse_failed": true,
  "store.validation_failed": true,
};

it("provides registrable feedback for every store failure code", () => {
  const dictionary: Record<StoreErrorEvent["code"], ErrorFeedback> = storeErrors;
  expect(Object.keys(dictionary).sort()).toEqual(Object.keys(expected).sort());
  for (const feedback of Object.values(dictionary)) {
    expect(feedback.source).toBe("store");
    expect(feedback.message).toMatch(/^We .+\.$/);
  }
});
