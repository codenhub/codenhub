import { afterEach, describe, expect, it, vi } from "vitest";

import { createHost } from "../src/host";
import { ConformanceHost, type Env } from "../src/worker";
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
