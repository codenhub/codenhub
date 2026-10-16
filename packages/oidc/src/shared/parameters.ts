import { MAX_PARAMETER_LENGTH, MAX_PARAMETERS } from "./limits";

/** Why a parameter string was refused: too many pairs, a pair too long, or a name repeated. */
export type ParameterFailure = "too_many" | "too_long" | "duplicate";

/** Outcome of {@link parseParameters}. */
export type ParseParametersResult =
  | { readonly ok: true; readonly parameters: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly reason: ParameterFailure };

/**
 * Parses an `application/x-www-form-urlencoded` query string or form body, refusing anything ambiguous.
 *
 * Empty values are dropped, as RFC 6749 §3.1 treats them as absent, but they still count toward
 * duplicates. The pair count is checked while parsing, so an oversized input never builds a map.
 */
export function parseParameters(text: string): ParseParametersResult {
  const entries: [string, string][] = [];
  for (const entry of new URLSearchParams(text)) {
    if (entries.length === MAX_PARAMETERS) {
      return { ok: false, reason: "too_many" };
    }
    entries.push(entry);
  }

  const parameters = new Map<string, string>();
  const names = new Set<string>();
  for (const [name, value] of entries) {
    if (name.length > MAX_PARAMETER_LENGTH || value.length > MAX_PARAMETER_LENGTH) {
      return { ok: false, reason: "too_long" };
    }
    // RFC 6749 §3.1: a parameter MUST NOT be included more than once, even if one copy is empty.
    if (names.has(name)) {
      return { ok: false, reason: "duplicate" };
    }
    names.add(name);
    if (value !== "") {
      parameters.set(name, value);
    }
  }
  return { ok: true, parameters };
}
