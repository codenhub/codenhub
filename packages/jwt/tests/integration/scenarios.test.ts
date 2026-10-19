import { describe, expect, it } from "vitest";

import * as source from "../../src/index";
import { runScenario, type Jwt } from "../scenarios";

/*
 * The scenarios retry Ed25519 generation only when their runner says the runtime needs it (see
 * `ScenarioOptions`). A module whose first generations fail as Linux WebKit's do shows the option is
 * what turns the retry on, on any runtime.
 */

/** The package, with its next `failures` key generations rejecting as Linux WebKit's do. */
function failingGenerations(failures: number): Jwt {
  let left = failures;
  return {
    ...source,
    generateKeyPair: async (options: Parameters<typeof source.generateKeyPair>[0]) => {
      if (left > 0) {
        left -= 1;
        throw new DOMException("The operation failed for an operation-specific reason", "OperationError");
      }
      return source.generateKeyPair(options);
    },
  } as Jwt;
}

describe("Ed25519 generation retry in the scenarios", () => {
  it("retries up to three failed generations when the runner asks", async () => {
    expect(
      await runScenario(failingGenerations(3), "EdDSA JWK export and import", { retryEd25519Generation: true }),
    ).toBe("ok");
  });

  it("reports a fourth failure in a row", async () => {
    expect(
      await runScenario(failingGenerations(4), "EdDSA JWK export and import", { retryEd25519Generation: true }),
    ).toBe("OperationError: The operation failed for an operation-specific reason");
  });

  it("does not retry when the runner does not ask", async () => {
    expect(await runScenario(failingGenerations(1), "Ed25519 generate, sign and verify")).toBe(
      "OperationError: The operation failed for an operation-specific reason",
    );
  });
});
