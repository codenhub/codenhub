import { type ClientRecord, hashClientSecret } from "@codenhub/oidc/provider";

/** The scopes every conformance client may request: the standard ones the Basic OP plan asks for. */
export const SCOPES = ["openid", "profile", "email", "address", "phone", "offline_access"] as const;

/** The identifiers of the registered clients. The runbook's plan configurations use these. */
export const CLIENT_IDS = {
  /** The plan's `client`, authenticating with `client_secret_basic`. */
  first: "conformance-1",
  /** The plan's `client2`, authenticating with `client_secret_basic`. */
  second: "conformance-2",
  /** A `client_secret_post` client, for the one module of the Basic OP plan that authenticates that way. */
  post: "conformance-post",
  /** Keeps PKCE required, to prove that the other clients' `requirePkce: false` is theirs alone. */
  control: "conformance-control",
} as const;

/** The secrets the host registers its clients with. They come from wrangler secrets. */
export interface ClientSecrets {
  readonly first: string;
  readonly second: string;
  readonly post: string;
  readonly control: string;
}

/** Where the suite's callback lives: `<origin>/test/a/<alias>/callback`. */
export function callbackUrl(suiteOrigin: string, alias: string): string {
  return `${suiteOrigin}/test/a/${alias}/callback`;
}

/**
 * Builds the registered clients. The three suite clients send no PKCE (`requirePkce: false`, scope.md decision
 * 52), so the provider holds them to a `nonce` instead. The control client keeps the default.
 *
 * @param suiteOrigin - The suite's origin without a trailing slash, such as `https://www.certification.openid.net`.
 * @param alias - The test plan's alias, the segment of the callback URL that the plan configuration names.
 * @param secrets - The plaintext secrets, hashed here so the store never holds one.
 */
export async function buildClients(
  suiteOrigin: string,
  alias: string,
  secrets: ClientSecrets,
): Promise<readonly ClientRecord[]> {
  const redirectUris = [callbackUrl(suiteOrigin, alias)];
  const record = async (
    clientId: string,
    secret: string,
    method: "client_secret_basic" | "client_secret_post",
    requirePkce: boolean,
    uris: readonly string[] = redirectUris,
  ): Promise<ClientRecord> => ({
    clientId,
    redirectUris: uris,
    scopes: SCOPES,
    auth: { method, secretHashes: [await hashClientSecret(secret)] },
    requirePkce,
  });
  return [
    await record(CLIENT_IDS.first, secrets.first, "client_secret_basic", false),
    await record(CLIENT_IDS.second, secrets.second, "client_secret_basic", false),
    await record(CLIENT_IDS.post, secrets.post, "client_secret_post", false),
    await record(CLIENT_IDS.control, secrets.control, "client_secret_basic", true, [
      callbackUrl(suiteOrigin, `${alias}-control`),
    ]),
  ];
}
