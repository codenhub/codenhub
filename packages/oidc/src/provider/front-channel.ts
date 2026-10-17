import { assertBodyUnread, readBody } from "../shared/body";
import { isFormContentType } from "../shared/content-type";
import { MAX_BODY_BYTES, MAX_URL_LENGTH } from "../shared/limits";
import { type ParameterFailure, parseParameters } from "../shared/parameters";

/** Outcome of {@link readFrontChannelParameters}. */
export type FrontChannelParameters =
  | { readonly ok: true; readonly parameters: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly reason: ParameterFailure | undefined };

/**
 * Reads the parameters of a request the browser sends, such as authorization or logout: from the query for `GET`,
 * from the form body for `POST`. An oversized URL, another method or media type, or an unreadable body fails with
 * no reason; a parameter string that breaks a rule fails with that rule. A body already read throws `TypeError`
 * naming `operation`.
 */
export async function readFrontChannelParameters(request: Request, operation: string): Promise<FrontChannelParameters> {
  assertBodyUnread(request, operation);
  if (request.url.length > MAX_URL_LENGTH) {
    return { ok: false, reason: undefined };
  }
  const text = await readRequestText(request);
  if (text === undefined) {
    return { ok: false, reason: undefined };
  }
  const parsed = parseParameters(text);
  return parsed.ok ? parsed : { ok: false, reason: parsed.reason };
}

/**
 * The raw query or form text, or `undefined` for a method or body this endpoint refuses.
 *
 * POST reads the body alone: parameters in the URL of a POST are not part of the request this endpoint answers.
 */
async function readRequestText(request: Request): Promise<string | undefined> {
  if (request.method === "GET") {
    return new URL(request.url).search.slice(1);
  }
  if (request.method !== "POST" || !isFormContentType(request.headers.get("content-type"))) {
    return undefined;
  }
  const body = await readBody(request, MAX_BODY_BYTES);
  return body.ok ? body.text : undefined;
}
