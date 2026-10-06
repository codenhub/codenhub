import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import { createAppError, getErrorRegistry } from "../index";
import { nodeErrorCodes, nodeErrorPatterns, nodeErrorRegistry } from "./node";

const getClosedPort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === "string") {
          reject(new Error("No port was assigned."));
        } else {
          resolve(address.port);
        }
      });
    });
  });

describe("node registry preset", () => {
  it("should not mutate the default registry on import", () => {
    expect([...getErrorRegistry().codes.values()]).toEqual([]);
    expect(createAppError({ code: "ECONNREFUSED" }).type).toBe("unknown");
  });

  it("should classify a real refused fetch through the code on its cause", async () => {
    const port = await getClosedPort();
    const failure: unknown = await fetch(`http://127.0.0.1:${port}/`).catch((error: unknown) => error);

    expect(createAppError(failure, { registry: nodeErrorRegistry })).toMatchObject({
      type: "known",
      code: "ECONNREFUSED",
      messageKey: "error.node.network.connectionRefused",
      source: "node.network",
      isRetryable: true,
    });
  });

  it("should classify a refused dual-stack fetch whose cause is an AggregateError", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED ::1:80"), { code: "ECONNREFUSED" });
    const failure = new TypeError("fetch failed", { cause: new AggregateError([refused], "") });

    expect(createAppError(failure, { registry: nodeErrorRegistry }).code).toBe("ECONNREFUSED");
  });

  it.each([
    ["ENOTFOUND", true],
    ["ETIMEDOUT", false],
    ["UND_ERR_CONNECT_TIMEOUT", true],
    ["EAI_AGAIN", true],
    ["EHOSTUNREACH", true],
    ["ENETUNREACH", true],
    ["EPIPE", false],
    ["ECONNRESET", false],
    ["UND_ERR_SOCKET", false],
    ["UND_ERR_HEADERS_TIMEOUT", false],
    ["UND_ERR_BODY_TIMEOUT", false],
  ])("should classify %s with isRetryable %j", (code, isRetryable) => {
    const failure = new TypeError("fetch failed", { cause: Object.assign(new Error("cause"), { code }) });

    expect(createAppError(failure, { registry: nodeErrorRegistry })).toMatchObject({
      type: "known",
      code,
      isRetryable,
    });
  });

  it("should not mark a timeout on an established socket as retryable", () => {
    const failure = Object.assign(new Error("read ETIMEDOUT"), { code: "ETIMEDOUT", syscall: "read" });

    expect(createAppError(failure, { registry: nodeErrorRegistry })).toMatchObject({
      code: "ETIMEDOUT",
      messageKey: "error.node.network.responseTimeout",
      isRetryable: false,
    });
  });

  it("should classify a failed fetch with no recognized cause as unexpected and not retryable", () => {
    const failure = new TypeError("fetch failed", { cause: new Error("bad port") });

    expect(createAppError(failure, { registry: nodeErrorRegistry })).toMatchObject({
      type: "unexpected",
      code: null,
      messageKey: "error.node.network.requestFailed",
      isRetryable: false,
    });
  });

  it("should not classify text that merely mentions a failed fetch", () => {
    expect(createAppError(new Error("Avatar fetch failed for user 42"), { registry: nodeErrorRegistry }).type).toBe(
      "unknown",
    );
  });

  it("should leave filesystem codes unclassified", () => {
    expect(createAppError({ code: "ENOENT" }, { registry: nodeErrorRegistry }).type).toBe("unknown");
  });

  it("should follow the repository's messageKey and source conventions with one message per key", () => {
    const presetFeedback = [...Object.values(nodeErrorCodes), ...nodeErrorPatterns.map(([, feedback]) => feedback)];
    const messagesByKey = new Map<string, string>();

    for (const feedback of presetFeedback) {
      expect(feedback.messageKey).toMatch(/^error\.node(?:\.[a-z][A-Za-z0-9]*)+$/);
      expect(feedback.source).toBe("node.network");
      expect(messagesByKey.get(feedback.messageKey ?? "") ?? feedback.message).toBe(feedback.message);
      messagesByKey.set(feedback.messageKey ?? "", feedback.message);
    }
  });

  it("should deeply freeze the raw mappings and expose a read-only registry", () => {
    expect(Object.isFrozen(nodeErrorCodes)).toBe(true);
    expect(Object.isFrozen(nodeErrorCodes.ECONNREFUSED)).toBe(true);
    expect(Object.isFrozen(nodeErrorPatterns)).toBe(true);
    expect(Object.isFrozen(nodeErrorPatterns[0][0])).toBe(true);
    expect(Object.isFrozen(nodeErrorPatterns[0][1])).toBe(true);
    expect(Reflect.has(nodeErrorRegistry.codes, "add")).toBe(false);
  });
});
