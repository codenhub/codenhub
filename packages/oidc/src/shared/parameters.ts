import { MAX_PARAMETER_LENGTH, MAX_PARAMETERS } from "./limits";

/**
 * Why a parameter string was refused: too many pairs, a pair too long, a name repeated, or a percent-escape
 * that is not valid UTF-8.
 */
export type ParameterFailure = "too_many" | "too_long" | "duplicate" | "malformed";

/** A maximal run of percent-escapes: the bytes of one or more UTF-8 sequences. */
const PERCENT_ESCAPE_RUN = /(?:%[0-9A-Fa-f]{2})+/g;

/**
 * Tests whether a run of percent-escapes decodes to invalid UTF-8. `URLSearchParams` would replace such bytes
 * with U+FFFD, so two different inputs would compare equal. A malformed escape such as `%zz` is not part of a
 * run and is left alone, as the URL standard keeps it literally.
 */
function hasInvalidUtf8Escape(text: string): boolean {
  for (const [run] of text.matchAll(PERCENT_ESCAPE_RUN)) {
    if (decodeRun(run) === undefined) {
      return true;
    }
  }
  return false;
}

/**
 * Decodes a run of percent-escapes, or returns `undefined` when they are not valid UTF-8. The decoded text is
 * returned rather than discarded: the bundler treats `decodeURIComponent` as free of side effects, so a call
 * whose result is unused is deleted along with the exception it exists to catch.
 */
function decodeRun(run: string): string | undefined {
  try {
    return decodeURIComponent(run);
  } catch {
    return undefined;
  }
}

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
  if (hasInvalidUtf8Escape(text)) {
    return { ok: false, reason: "malformed" };
  }
  const entries: [string, string][] = [];
  // `URLSearchParams` parses all of `text` before this loop can stop it, so callers must bound the text
  // length first; the URL length and body size caps do. The pair cap bounds what is kept, not what is parsed.
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
