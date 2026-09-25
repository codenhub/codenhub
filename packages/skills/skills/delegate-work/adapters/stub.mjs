/**
 * Adapter interface (every harness implements the same shape):
 *
 * detect()                -> { ok, version?, reason? }            cached per process
 * command(ctx)            -> { args, env, input }                  ctx: { route, cwd, prompt, readOnly,
 *                                                                        allow, bashAllow, sessionId }
 * parseLine(line, acc)    -> void                                  fills acc.{sessionId, edits[], denied[],
 *                                                                        texts[], errors[], steps}
 * finalText(acc)          -> string                                the worker's last message
 * parseStderr(text, acc) -> void                                  optional: facts only logged on stderr
 * models()               -> Map | null                            optional: id -> { context }; cached by
 *                                                                        scripts/lib/models.mjs
 * probe(route)           -> string[]                              optional: doctor notes about this machine
 * classify({ code, acc, stderrTail }) -> { kind, retryAfterMs?, message }
 *                            kind: ok | billing | rate_limit | auth | unavailable | transient | fatal
 */
export function stub(name) {
  return {
    name,
    detect: () => ({ ok: false, reason: "adapter not implemented yet" }),
  };
}
