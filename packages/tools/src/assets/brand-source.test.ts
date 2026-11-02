import { describe, expect, it } from "vitest";

import { createMemoryBrand } from "./brand-source.test-support.ts";
import { BrandUnreachableError, createBrandSource } from "./brand-source.ts";

const BASE_URL = "https://brand.test/brand/";

function sourceAnswering(status: number, body: unknown) {
  return createBrandSource({
    baseUrl: BASE_URL,
    fetch: async () => (typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status })),
  });
}

describe("createBrandSource", () => {
  it("shouldFindAFileByItsPathBelowAssets", async () => {
    const brand = createMemoryBrand({ "logo/logo-dark.svg": "<svg/>" });

    const file = await brand.source.lookup("logo/logo-dark.svg");

    expect(file).toMatchObject({ path: "assets/logo/logo-dark.svg", size: 6 });
    await expect(brand.source.lookup("logo/missing.svg")).resolves.toBeUndefined();
    await expect(brand.source.download(file!)).resolves.toEqual(new TextEncoder().encode("<svg/>"));
  });

  it("shouldFetchTheIndexOnceForEveryLookup", async () => {
    const brand = createMemoryBrand({ "a.svg": "a", "b.svg": "b" });

    await Promise.all([brand.source.lookup("a.svg"), brand.source.lookup("b.svg"), brand.source.lookup("a.svg")]);

    expect(brand.requests).toEqual(["index.json"]);
  });

  it("shouldRetryTheIndexAfterAFailedFetch", async () => {
    const brand = createMemoryBrand({ "a.svg": "a" });
    brand.isOffline = true;
    await expect(brand.source.lookup("a.svg")).rejects.toBeInstanceOf(BrandUnreachableError);

    brand.isOffline = false;

    await expect(brand.source.lookup("a.svg")).resolves.toBeDefined();
  });

  it("shouldRefuseBytesThatDoNotMatchTheIndex", async () => {
    const brand = createMemoryBrand({ "a.svg": "served" });
    brand.listed.set("a.svg", "listed");
    const file = await brand.source.lookup("a.svg");

    await expect(brand.source.download(file!)).rejects.toThrow(/does not match the brand index/);
  });

  it("shouldTreatAServerErrorAsUnreachable", async () => {
    await expect(sourceAnswering(503, "down").lookup("a.svg")).rejects.toBeInstanceOf(BrandUnreachableError);
  });

  it("shouldTreatAClientErrorAsAFailureNotAnOutage", async () => {
    const lookup = sourceAnswering(404, "missing").lookup("a.svg");

    await expect(lookup).rejects.toThrow(/answered 404/);
    await expect(lookup).rejects.not.toBeInstanceOf(BrandUnreachableError);
  });

  it("shouldRefuseAnIndexVersionItDoesNotRead", async () => {
    await expect(sourceAnswering(200, { version: 2, files: [] }).lookup("a.svg")).rejects.toThrow(
      /has version 2; this hub reads version 1/,
    );
  });

  it.each([
    ["not JSON", "{"],
    ["no files array", { version: 1 }],
    ["a traversal path", { version: 1, files: [{ path: "../secret", size: 1, sha256: "0".repeat(64) }] }],
    ["a bad hash", { version: 1, files: [{ path: "assets/a.svg", size: 1, sha256: "abc" }] }],
    ["a negative size", { version: 1, files: [{ path: "assets/a.svg", size: -1, sha256: "0".repeat(64) }] }],
  ])("shouldRefuseAnIndexWith%s", async (_case, body) => {
    await expect(sourceAnswering(200, body).lookup("a.svg")).rejects.toThrow(/brand index/);
  });
});
