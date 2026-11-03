import { describe, expect, it } from "vitest";

import { createAppError, err, getErrorRegistry } from "../index";
import { httpErrorCodes, httpErrorRegistry } from "./http";

describe("http registry preset", () => {
  it("should not mutate the default registry on import", () => {
    expect([...getErrorRegistry().codes.values()]).toEqual([]);
    expect(createAppError({ code: 404 }).type).toBe("unknown");
  });

  it("should classify a numeric status passed as a code", () => {
    const appError = createAppError({ code: 404 }, { registry: httpErrorRegistry });

    expect(appError).toMatchObject({
      type: "known",
      code: "404",
      messageKey: "error.http.notFound",
      source: "http",
      isRetryable: false,
    });
  });

  it("should classify a failed response's status as the recipe passes it", async () => {
    const response = new Response("{}", { status: 429 });
    const result = err({ code: response.status, cause: await response.text() }, { registry: httpErrorRegistry });

    expect(result.error.messageKey).toBe("error.http.rateLimited");
  });

  it("should leave an unmapped status unknown", () => {
    expect(createAppError({ code: 418 }, { registry: httpErrorRegistry }).type).toBe("unknown");
  });

  it("should mark no status retryable", () => {
    for (const feedback of Object.values(httpErrorCodes)) {
      expect(feedback.isRetryable).not.toBe(true);
    }
  });

  it("should expose frozen raw mappings and a read-only registry", () => {
    expect(Object.isFrozen(httpErrorCodes)).toBe(true);
    expect(Object.isFrozen(httpErrorCodes["404"])).toBe(true);
    expect("add" in httpErrorRegistry.codes).toBe(false);
  });

  it("should map only client and server error statuses", () => {
    for (const status of Object.keys(httpErrorCodes)) {
      expect(Number(status)).toBeGreaterThanOrEqual(400);
      expect(Number(status)).toBeLessThan(600);
    }
  });
});
