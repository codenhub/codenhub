import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "./args.ts";

test("parses --bail", () => {
  assert.equal(parseArgs(["--bail"]).bail, true);
});

test("rejects unknown arguments", () => {
  assert.throws(() => parseArgs(["--nope"]), /Unknown argument/);
});
