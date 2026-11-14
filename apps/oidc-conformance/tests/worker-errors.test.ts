import { afterEach, describe, expect, it, vi } from "vitest";

import { createHost } from "../src/host";
import { ConformanceHost, type Env, readConfig } from "../src/worker";
import { ALIAS, ISSUER, SECRETS } from "./support";

vi.mock("../src/host", () => ({ createHost: vi.fn() }));

const env = {
  ISSUER,
  SUITE_ALIAS: ALIAS,
  CLIENT_SECRET_1: SECRETS.first,
  CLIENT_SECRET_2: SECRETS.second,
  CLIENT_SECRET_POST: SECRETS.post,
  CLIENT_SECRET_CONTROL: SECRETS.control,
} as unknown as Env;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readConfig", () => {
  it("drops a trailing slash from SUITE_ORIGIN, which the callback URLs are appended to", () => {
    expect(readConfig({ ...env, SUITE_ORIGIN: "https://suite.example/" }).suiteOrigin).toBe("https://suite.example");
  });

  it.each(["https://suite.example/plans", "suite.example"])("refuses %s as SUITE_ORIGIN", (value) => {
    expect(() => readConfig({ ...env, SUITE_ORIGIN: value })).toThrow("SUITE_ORIGIN must be an origin");
  });
});

describe("a failure in the Worker's object", () => {
  it("answers a generic 500 for an exception while answering, and logs the message", async () => {
    vi.mocked(createHost).mockResolvedValue({
      provider: {} as never,
      fetch: () => Promise.reject(new Error("internal detail")),
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await new ConformanceHost(undefined, env).fetch(new Request(`${ISSUER}/token?code=a-code`));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toBe("Conformance host failed to answer the request.\n");
    expect(logged).toHaveBeenCalledWith("Conformance host failed on GET /token: internal detail");
  });

  it("names a start failure to the caller", async () => {
    vi.mocked(createHost).mockRejectedValue(new Error("Self-check failed."));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await new ConformanceHost(undefined, env).fetch(new Request(`${ISSUER}/`));

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Conformance host failed to start: Self-check failed.\n");
  });
});
