/** Classify a harness failure from its error text. Shared by adapters; override per harness if needed. */
export function classifyText(text) {
  const t = text || "";
  // "Retry-After: 30", "retry after 2m", Google's "Please retry in 13.87s",
  // usage limits' "try again in 3 hours".
  const retry = t.match(
    /(?:retry(?:[- ]?after| in)|try again in)\D{0,12}(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?|m|mins?|minutes?|h|hours?|days?)?/i,
  );
  let retryAfterMs;
  if (retry) {
    const n = +retry[1],
      u = (retry[2] || "s").toLowerCase();
    const unit =
      u === "ms" ? 1 : u.startsWith("d") ? 86400000 : u.startsWith("h") ? 3600000 : u.startsWith("m") ? 60000 : 1000;
    retryAfterMs = Math.ceil(n * unit);
  }
  // Not "billing": Google's per-minute 429 says "check your plan and billing details".
  if (/\b402\b|payment required|insufficient (credits|balance|funds)|credit balance/i.test(t)) {
    return { kind: "billing" };
  }
  if (
    /\b429\b|rate.?limit|too many requests|quota|resource.?exhausted|usage limit|limit reached|overloaded|\b529\b/i.test(
      t,
    )
  ) {
    return { kind: "rate_limit", retryAfterMs };
  }
  if (
    /\b40[13]\b|unauthori[sz]ed|forbidden|invalid.{0,10}(api.?key|token)|not (logged|signed) in|log ?in again|credential|authenticat/i.test(
      t,
    )
  ) {
    return { kind: "auth" };
  }
  if (
    /model.{0,40}(not found|not available|does not exist|unsupported|not recognized)|unknown model|ModelNotFound|ProviderModelNotFound|no such model|no endpoints found|model is not supported/i.test(
      t,
    )
  ) {
    return { kind: "unavailable" };
  }
  if (
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|\b50[0234]\b/i.test(t)
  ) {
    return { kind: "transient", retryAfterMs: retryAfterMs ?? 60000 };
  }
  return { kind: "fatal" };
}

// oxlint-disable-next-line no-control-regex -- matching the ESC byte is the point.
export const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
