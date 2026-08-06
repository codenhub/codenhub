import { describe, expect, it } from "vitest";

import { parseCheckExceptions } from "./exceptions.ts";

const REGISTER = [
  "# Package exceptions",
  "",
  "## `@codenhub/styles`: CSS-only package",
  "",
  "- **Rules bypassed:** `docs/specs/packages-lifecycle.md` (metadata fields).",
  "- **Checks bypassed:** `metadata/main`, `metadata/module`, `metadata/types`.",
  "- **Temporary or permanent:** Permanent.",
  "",
  "## `@codenhub/styles`: Coverage report",
  "",
  "- **Checks bypassed:** `scripts/test:coverage`.",
  "",
  "## `@codenhub/error`: registry presets",
  "",
  "- **Rules bypassed:** `docs/specs/errors.md`.",
  "- **Temporary or permanent:** Permanent.",
].join("\n");

describe("parseCheckExceptions", () => {
  it("shouldWaiveOnlyTheDeclaredCheckCodes", () => {
    expect(parseCheckExceptions(REGISTER).get("@codenhub/styles")).toEqual(
      new Set(["metadata/main", "metadata/module", "metadata/types", "scripts/test:coverage"]),
    );
  });

  it("shouldIgnoreEntriesWithoutAMachineReadableBypass", () => {
    expect(parseCheckExceptions(REGISTER).has("@codenhub/error")).toBe(false);
  });

  it("shouldReturnNothingForARegisterWithoutBypasses", () => {
    expect(parseCheckExceptions("# Package exceptions\n\nNothing yet.\n").size).toBe(0);
  });
});
