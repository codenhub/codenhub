import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { copyBytes, isArrayBuffer } from "./bytes";

describe("copyBytes", () => {
  it("should copy a Uint8Array, another typed array, a DataView and an ArrayBuffer", () => {
    const backing = new Uint8Array([9, 1, 2, 3, 9]);
    expect(copyBytes(backing.subarray(1, 4))).toEqual(new Uint8Array([1, 2, 3]));
    expect(copyBytes(new DataView(backing.buffer, 1, 3))).toEqual(new Uint8Array([1, 2, 3]));
    expect(copyBytes(backing.buffer)).toEqual(backing);
    expect(copyBytes(new Uint16Array([0x0201]))?.length).toBe(2);
  });

  it("should copy bytes from another realm", () => {
    expect(copyBytes(runInNewContext("new Uint8Array([1, 2])"))).toEqual(new Uint8Array([1, 2]));
    expect(copyBytes(runInNewContext("new Uint8Array([1, 2]).buffer"))).toEqual(new Uint8Array([1, 2]));
    expect(copyBytes(runInNewContext("new DataView(new Uint8Array([1, 2]).buffer)"))).toEqual(new Uint8Array([1, 2]));
  });

  it("should return a copy that later writes to the source do not reach", () => {
    const source = new Uint8Array([1, 2]);
    const copy = copyBytes(source);
    source[0] = 7;
    expect(copy).toEqual(new Uint8Array([1, 2]));
  });

  it("should never run an overridden getter", () => {
    const bytes = new Uint8Array([1, 2]);
    Object.defineProperty(bytes, "buffer", {
      get() {
        throw new Error("ran");
      },
    });
    expect(copyBytes(bytes)).toEqual(new Uint8Array([1, 2]));
  });

  it("should give undefined for a detached buffer and for values that hold no bytes", () => {
    const buffer = new ArrayBuffer(4);
    const view = new Uint8Array(buffer);
    structuredClone(buffer, { transfer: [buffer] });
    expect(copyBytes(buffer)).toBeUndefined();
    expect(copyBytes(view)).toBeUndefined();
    expect(copyBytes({ length: 2, 0: 1, 1: 2 })).toBeUndefined();
    expect(copyBytes("ab")).toBeUndefined();
    expect(copyBytes(null)).toBeUndefined();
  });
});

describe("isArrayBuffer", () => {
  it("should recognize an ArrayBuffer of any realm and nothing else", () => {
    expect(isArrayBuffer(new ArrayBuffer(1))).toBe(true);
    expect(isArrayBuffer(runInNewContext("new ArrayBuffer(1)"))).toBe(true);
    expect(isArrayBuffer(new Uint8Array(1))).toBe(false);
    expect(isArrayBuffer({ byteLength: 1 })).toBe(false);
  });
});
