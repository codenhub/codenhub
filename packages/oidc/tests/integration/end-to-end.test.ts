import * as jwt from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import * as client from "../../src/client";
import * as provider from "../../src/provider";
import * as testing from "../../src/testing";
import { runScenario, scenarios } from "../scenarios";

describe("end to end on Node.js", () => {
  it.each(Object.keys(scenarios))("%s", async (name) => {
    expect(await runScenario({ jwt, client, provider, testing }, name)).toBe("ok");
  });
});
