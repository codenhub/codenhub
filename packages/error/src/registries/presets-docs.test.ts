import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { browserErrorNames } from "./browser";
import { nodeErrorCodes, nodeErrorNames } from "./node";
import { supabaseErrorCodes, supabaseErrorNames } from "./supabase";

// docs/presets.md lists every mapping by hand so a reader can build a translation catalog from it.
// A mapping added, removed, or rekeyed in the source has to change that table in the same change.
const presetsPage = readFileSync(new URL("../../docs/presets.md", import.meta.url), "utf8");

// A set rather than a map keyed by identifier: the browser and Node.js presets both map `TimeoutError`
// and `AbortError`, each in its own table.
const tableRows = new Set<string>();
for (const line of presetsPage.split("\n")) {
  const cells = line.split("|").map((cell) => cell.trim());
  const identifier = /^`([^`]+)`$/.exec(cells[1] ?? "")?.[1];
  const messageKey = cells.map((cell) => /^`(error\.[^`]+)`$/.exec(cell)?.[1]).find((key) => key !== undefined);

  if (identifier !== undefined && messageKey !== undefined) {
    tableRows.add(`${identifier} ${messageKey} ${cells.at(-2)}`);
  }
}

describe("presets documentation", () => {
  it.each([
    ...Object.entries(browserErrorNames),
    ...Object.entries(nodeErrorCodes),
    ...Object.entries(nodeErrorNames),
    ...Object.entries(supabaseErrorCodes),
    ...Object.entries(supabaseErrorNames),
  ])("should list %s with its messageKey and retry flag", (identifier, feedback) => {
    expect([...tableRows]).toContain(
      `${identifier} ${feedback.messageKey} ${feedback.isRetryable === true ? "Yes" : "No"}`,
    );
  });
});
