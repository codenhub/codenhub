import { describe, expect, it } from "vitest";

import { fillMessage } from "./messages.ts";

describe("fillMessage", () => {
  it("fills every placeholder it has a value for", () => {
    expect(fillMessage("{count} results for “{query}”", { count: 3, query: "router" })).toBe("3 results for “router”");
  });

  it("leaves a placeholder without a value as written", () => {
    expect(fillMessage("{site} home", {})).toBe("{site} home");
  });

  it("inserts a value literally, even one that looks like a placeholder or a replacement pattern", () => {
    expect(fillMessage("No match for {query}", { query: "{count} $&" })).toBe("No match for {count} $&");
  });

  it("ignores inherited properties", () => {
    expect(fillMessage("{toString}", {})).toBe("{toString}");
  });
});
