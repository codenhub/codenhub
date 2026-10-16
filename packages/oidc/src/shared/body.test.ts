import { describe, expect, it } from "vitest";

import { readBody } from "./body";

const URL_UNDER_TEST = "https://provider.test/token";

/** A stream that emits the given chunks in order, then closes. */
const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

// `duplex` is required by Node for stream bodies but missing from the DOM lib's RequestInit, so the
// init is built outside the literal to avoid an excess-property error.
const postWithStream = (stream: ReadableStream<Uint8Array>, headers?: Record<string, string>): Request => {
  const init = { method: "POST", body: stream, duplex: "half", headers };
  return new Request(URL_UNDER_TEST, init);
};

describe("readBody", () => {
  it("shouldReadSmallBodyAsText", async () => {
    const request = new Request(URL_UNDER_TEST, { method: "POST", body: "grant_type=refresh_token" });
    expect(await readBody(request, 1024)).toEqual({ ok: true, text: "grant_type=refresh_token" });
  });

  it("shouldAcceptBodyOfExactlyTheLimit", async () => {
    const request = new Request(URL_UNDER_TEST, { method: "POST", body: "abcd" });
    expect(await readBody(request, 4)).toEqual({ ok: true, text: "abcd" });
  });

  it("shouldRefuseBodyOneByteOverTheLimit", async () => {
    const request = new Request(URL_UNDER_TEST, { method: "POST", body: "abcde" });
    expect(await readBody(request, 4)).toEqual({ ok: false, reason: "too_large" });
  });

  it("shouldRefuseWithoutReadingWhenContentLengthIsOverTheLimit", async () => {
    const request = postWithStream(streamOf("unused"), { "content-length": "99999" });
    expect(await readBody(request, 1024)).toEqual({ ok: false, reason: "too_large" });
    expect(request.bodyUsed).toBe(false);
  });

  it("shouldRefuseWhenStreamExceedsLimitDespiteSmallContentLength", async () => {
    const request = postWithStream(streamOf("aaaa", "bbbb", "cccc"), { "content-length": "3" });
    expect(await readBody(request, 8)).toEqual({ ok: false, reason: "too_large" });
  });

  it("shouldCancelStreamOnceLimitIsCrossed", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode("xxxx"));
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await readBody(postWithStream(stream), 6)).toEqual({ ok: false, reason: "too_large" });
    expect(cancelled).toBe(true);
  });

  it("shouldIgnoreNonDecimalContentLengthAndStillReadStream", async () => {
    const request = postWithStream(streamOf("ok"), { "content-length": "1e9" });
    expect(await readBody(request, 1024)).toEqual({ ok: true, text: "ok" });
  });

  it("shouldRefuseInvalidUtf8AsUnreadable", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0x61, 0xff, 0x62]));
        controller.close();
      },
    });
    expect(await readBody(postWithStream(stream), 1024)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("shouldReturnEmptyStringForNullBody", async () => {
    const request = new Request(URL_UNDER_TEST, { method: "GET" });
    expect(await readBody(request, 1024)).toEqual({ ok: true, text: "" });
  });

  it("shouldReportUnreadableWhenStreamErrors", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    expect(await readBody(postWithStream(stream), 1024)).toEqual({ ok: false, reason: "unreadable" });
  });
});
