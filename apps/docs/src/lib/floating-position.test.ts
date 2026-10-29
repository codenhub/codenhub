import { describe, expect, it } from "vitest";

import { placeFloating } from "./floating-position";

const viewport = { height: 800, width: 1200 };
const floating = { height: 200, width: 300 };

describe("placeFloating", () => {
  it("opens below the anchor, aligned to its start edge", () => {
    const anchor = { bottom: 120, left: 100, right: 180, top: 100 };

    expect(placeFloating({ align: "start", anchor, floating, viewport })).toEqual({ left: 100, top: 128 });
  });

  it("aligns to the anchor's end edge when asked", () => {
    const anchor = { bottom: 120, left: 900, right: 1000, top: 100 };

    expect(placeFloating({ align: "end", anchor, floating, viewport })).toEqual({ left: 700, top: 128 });
  });

  it("opens above when only the space above fits", () => {
    const anchor = { bottom: 720, left: 100, right: 180, top: 700 };

    expect(placeFloating({ align: "start", anchor, floating, viewport })).toEqual({ left: 100, top: 492 });
  });

  it("stays below when neither side fits", () => {
    const anchor = { bottom: 120, left: 100, right: 180, top: 100 };
    const tall = { height: 790, width: 300 };

    expect(placeFloating({ align: "start", anchor, floating: tall, viewport }).top).toBe(128);
  });

  it("slides inside the viewport at either edge", () => {
    const nearRight = { bottom: 120, left: 1100, right: 1180, top: 100 };
    const nearLeft = { bottom: 120, left: 0, right: 40, top: 100 };

    expect(placeFloating({ align: "start", anchor: nearRight, floating, viewport }).left).toBe(892);
    expect(placeFloating({ align: "end", anchor: nearLeft, floating, viewport }).left).toBe(8);
  });
});
