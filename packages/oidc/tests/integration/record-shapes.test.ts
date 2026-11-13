import { describe, expect, it } from "vitest";

import {
  codeForm,
  issueCode,
  PUBLIC_CLIENT,
  redeem,
  refreshForm,
  setUpProvider,
  type TokenBody,
} from "./provider-support";

/** Decodes a token's payload without verifying it; the provider's own tests cover the signature. */
const payloadOf = (token: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;

describe("a session id on a grant", () => {
  it("reaches the ID token of the code exchange and of every refresh as sid", async () => {
    const setup = await setUpProvider();
    const issued = await issueCode(setup, {
      params: { scope: "openid profile offline_access" },
      grant: { sessionId: "session-42" },
    });

    const exchanged = (await (await redeem(setup, codeForm(issued, PUBLIC_CLIENT))).json()) as TokenBody;
    const refreshed = (await (
      await redeem(setup, refreshForm(exchanged.refresh_token ?? "", PUBLIC_CLIENT))
    ).json()) as TokenBody;

    expect(payloadOf(exchanged.id_token).sid).toBe("session-42");
    expect(payloadOf(refreshed.id_token).sid).toBe("session-42");
  });

  it("leaves sid out of the ID token when the grant has no session id", async () => {
    const setup = await setUpProvider();
    const issued = await issueCode(setup);

    const exchanged = (await (await redeem(setup, codeForm(issued, PUBLIC_CLIENT))).json()) as TokenBody;

    expect(payloadOf(exchanged.id_token)).not.toHaveProperty("sid");
  });
});
