import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { runCheckRules, type CheckRule, type Finding } from "./rule.ts";

const context = { includePack: false, package: { name: "@fixture/example" } as WorkspacePackage };

/**
 * Creates a rule that records when it starts and finishes, and reports one finding named after it.
 * @param name Rule name and finding code.
 * @param events Log every rule appends to.
 * @param rebuildsPackage Whether the rule rebuilds the package.
 * @returns The rule.
 */
function createRule(name: string, events: string[], rebuildsPackage?: boolean): CheckRule {
  return {
    appliesTo: () => true,
    name,
    rebuildsPackage,
    run: async (): Promise<Finding[]> => {
      events.push(`${name} start`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(`${name} end`);
      return [{ code: name, message: name, severity: "error" }];
    },
    summary: name,
  };
}

describe("runCheckRules", () => {
  it("shouldRunARebuildingRuleOnlyAfterEveryReadingRuleFinished", async () => {
    const events: string[] = [];
    const rules = [createRule("size", events, true), createRule("exports", events), createRule("readme", events)];

    await runCheckRules(rules, context);

    expect(events.indexOf("size start")).toBeGreaterThan(events.indexOf("exports end"));
    expect(events.indexOf("size start")).toBeGreaterThan(events.indexOf("readme end"));
  });

  it("shouldRunRebuildingRulesOneAtATime", async () => {
    const events: string[] = [];

    await runCheckRules([createRule("first", events, true), createRule("second", events, true)], context);

    expect(events).toEqual(["first start", "first end", "second start", "second end"]);
  });

  it("shouldReturnFindingsInTheOrderOfTheRules", async () => {
    const events: string[] = [];
    const rules = [createRule("size", events, true), createRule("exports", events)];

    const results = await runCheckRules(rules, context);

    expect(results.map((findings) => findings.map(({ code }) => code))).toEqual([["size"], ["exports"]]);
  });
});
