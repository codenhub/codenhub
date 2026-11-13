import { CLIENT_IDS, callbackUrl } from "../src/clients";

export const ISSUER = "https://op.test";
export const ALIAS = "unit";
export const SUITE_ORIGIN = "https://www.certification.openid.net";
export const SECRETS = {
  first: "secret-one",
  second: "secret-two",
  post: "secret-post",
  control: "secret-control",
};
export const CALLBACK = callbackUrl(SUITE_ORIGIN, ALIAS);

/** Sends a request to the host under test, in Node.js or in workerd. */
export type Send = (request: Request) => Promise<Response>;

/** The query of an authorization request from a suite client, which sends no PKCE. */
export function authorizationUrl(overrides: Record<string, string | null> = {}): string {
  const params: Record<string, string | null> = {
    client_id: CLIENT_IDS.first,
    redirect_uri: CALLBACK,
    response_type: "code",
    scope: "openid profile email address phone offline_access",
    state: "state-1",
    nonce: "nonce-1",
    ...overrides,
  };
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== null) {
      query.set(name, value);
    }
  }
  return `${ISSUER}/authorize?${query.toString()}`;
}

/** The query parameters of a redirect's `Location`, which the provider appends to the registered URI. */
export function redirectParams(response: Response): URLSearchParams {
  expect302(response);
  return new URL(response.headers.get("location") ?? "").searchParams;
}

function expect302(response: Response): void {
  if (response.status !== 302) {
    throw new Error(`Expected a 302, got ${response.status}`);
  }
}

/** The `name=value` part of the session cookie a response set, to send back as a `Cookie` header. */
export function sessionCookie(response: Response): string | undefined {
  return response.headers.get("set-cookie")?.split(";")[0];
}

export function get(send: Send, url: string, cookie?: string): Promise<Response> {
  return send(new Request(url, { redirect: "manual", headers: cookie === undefined ? {} : { Cookie: cookie } }));
}

export function tokenRequest(
  clientId: string,
  secret: string,
  form: Record<string, string>,
  method: "basic" | "post" = "basic",
): Request {
  const body = new URLSearchParams(form);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (method === "basic") {
    headers["Authorization"] = `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`)}`;
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", secret);
  }
  return new Request(`${ISSUER}/token`, { method: "POST", headers, body });
}

export function decodePayload(jwt: string): Record<string, unknown> {
  return JSON.parse(atob((jwt.split(".")[1] ?? "").replaceAll("-", "+").replaceAll("_", "/"))) as Record<
    string,
    unknown
  >;
}

export function decodeHeader(jwt: string): Record<string, unknown> {
  return JSON.parse(atob((jwt.split(".")[0] ?? "").replaceAll("-", "+").replaceAll("_", "/"))) as Record<
    string,
    unknown
  >;
}

/** What a full sign-in through a host produced. */
export interface CodeFlow {
  readonly tokens: { access_token: string; id_token: string; refresh_token?: string; token_type: string };
  readonly userinfo: Record<string, unknown>;
  readonly cookie: string | undefined;
}

/** Signs in with a suite client that sends no PKCE, exchanges the code, and reads userinfo. */
export async function codeFlow(send: Send): Promise<CodeFlow> {
  const authorized = await get(send, authorizationUrl());
  const params = redirectParams(authorized);
  const code = params.get("code");
  if (code === null || params.get("state") !== "state-1" || params.get("iss") !== ISSUER) {
    throw new Error(`The authorization response carried no code: ${authorized.headers.get("location")}`);
  }
  const exchanged = await send(
    tokenRequest(CLIENT_IDS.first, SECRETS.first, { grant_type: "authorization_code", code, redirect_uri: CALLBACK }),
  );
  if (exchanged.status !== 200) {
    throw new Error(`The token endpoint answered ${exchanged.status}`);
  }
  const tokens = (await exchanged.json()) as CodeFlow["tokens"];
  const info = await send(
    new Request(`${ISSUER}/userinfo`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }),
  );
  return { tokens, userinfo: (await info.json()) as Record<string, unknown>, cookie: sessionCookie(authorized) };
}
