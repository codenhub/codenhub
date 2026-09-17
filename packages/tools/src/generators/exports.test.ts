import { describe, expect, it } from "vitest";

/* Every other test in this directory imports these relatively, which proves
   the logic but not the package's own promise: that `@codenhub/tools/generators`,
   declared in `package.json` `exports`, actually resolves to this module for a
   consumer outside `packages/tools/src`. Nothing does that yet -- the first real
   consumer is the package-owned generator this export exists for, not written
   yet -- so this is the one thing standing in for it until then. */
describe("@codenhub/tools/generators", () => {
  it("shouldResolveThePublishedSubpathToTheGeneratorExports", async () => {
    const generators = await import("@codenhub/tools/generators");

    expect(typeof generators.applyGenerated).toBe("function");
    expect(typeof generators.findWorkspaceRoot).toBe("function");
    expect(typeof generators.hasContentDrift).toBe("function");
    expect(typeof generators.replaceGeneratedRegion).toBe("function");
  });
});
