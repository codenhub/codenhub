/** Outcome of {@link readBody}: the decoded text, or the reason the body was refused. */
export type ReadBodyResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "too_large" | "unreadable" };

const DECIMAL_INTEGER_PATTERN = /^\d+$/;

/**
 * Reads a request body as UTF-8 text, refusing it once it exceeds `maxBytes`.
 *
 * A `content-length` over the limit is refused without reading. The header can lie, so the byte count
 * is also enforced while streaming, and the stream is cancelled as soon as the limit is crossed.
 */
export async function readBody(request: Request, maxBytes: number): Promise<ReadBodyResult> {
  if (isDeclaredLengthOver(request, maxBytes)) {
    return { ok: false, reason: "too_large" };
  }
  if (request.body === null) {
    return { ok: true, text: "" };
  }
  try {
    const bytes = await readStreamUpTo(request.body, maxBytes);
    if (bytes === undefined) {
      return { ok: false, reason: "too_large" };
    }
    // Fatal, so invalid UTF-8 is an error here and not silently replaced with U+FFFD.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

/** Tests whether a declared `content-length` is a decimal integer above the limit. */
const isDeclaredLengthOver = (request: Request, maxBytes: number): boolean => {
  const declared = request.headers.get("content-length");
  return declared !== null && DECIMAL_INTEGER_PATTERN.test(declared) && Number(declared) > maxBytes;
};

/** Waits for a promise whose outcome no longer matters, so its rejection is not reported as unhandled. */
export async function ignoreRejection(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // Deliberately ignored: the request already has its outcome.
  }
}

/**
 * Collects a stream into one buffer, or returns `undefined` after cancelling it once it passes `maxBytes`.
 *
 * Cancellation can itself reject on a stream that is already errored, and that rejection is ignored
 * because the caller's answer is already "too large".
 */
export const readStreamUpTo = async (
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | undefined> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each chunk decides whether the next one is read
    const next = await reader.read();
    if (next.done) {
      break;
    }
    total += next.value.byteLength;
    if (total > maxBytes) {
      // Not awaited: the caller's answer is already "too large", so the cancel only has to settle quietly.
      void ignoreRejection(reader.cancel());
      return undefined;
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};
