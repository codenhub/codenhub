import { describe, expect, it } from "vitest";

import { array } from "../composition/array";
import { object } from "../composition/object";
import { invalidTypeMessage } from "../messages/english-messages";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { assert } from "./assert";
import { pass } from "./result";
import type { AsyncValidator, Validator } from "./types";

const caught = (work: () => unknown): TypeError => {
  try {
    work();
  } catch (error) {
    return error as TypeError;
  }
  throw new Error("Expected a throw");
};

describe("assert", () => {
  const config = object({ locales: array(string({ trim: true, min: 1 })), port: number() });
  const messages = { invalid_type: invalidTypeMessage };

  it("should return the value the validator produced", () => {
    expect(assert(config, { locales: [" en "], port: 80 })).toEqual({ locales: ["en"], port: 80 });
  });

  it("should throw a TypeError naming the subject, the path and the wording of the first issue", () => {
    const error = caught(() => assert(config, { locales: ["en", 1], port: "80" }, { subject: "[I18n]", messages }));
    expect(error).toBeInstanceOf(TypeError);
    expect(error.message).toBe("[I18n] locales[1]: Expected string, received number");
  });

  it("should leave out the path of an issue at the value itself, and the subject when there is none", () => {
    expect(caught(() => assert(string(), 1, { subject: "name:" })).message).toBe("name: Invalid value");
    expect(caught(() => assert(string(), 1)).message).toBe("Invalid value");
    expect(caught(() => assert(config, { locales: [], port: "80" })).message).toBe("port: Invalid value");
  });

  it("should prefer the message an issue carries to the map", () => {
    const named = string({ message: "Must be a name" });
    expect(caught(() => assert(named, 1, { messages })).message).toBe("Must be a name");
  });

  it("should carry the failure, with every issue, as the cause", () => {
    const error = caught(() => assert(config, { locales: [1], port: "80" }));
    expect((error.cause as { issues: unknown[] }).issues).toHaveLength(2);
  });

  it("should throw a TypeError naming the fix when the validator is asynchronous", () => {
    const asynchronous = (async (input) => pass(input)) as AsyncValidator<unknown> as Validator<unknown>;
    expect(() => assert(asynchronous, 1)).toThrow(/needs a synchronous validator/);
  });

  it("should not leave an unhandled rejection behind for an asynchronous validator that fails", async () => {
    const rejecting = (() => Promise.reject(new Error("boom"))) as unknown as Validator<unknown>;
    expect(() => assert(rejecting, 1)).toThrow(TypeError);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("should reject a subject that is not text and messages that are not a map", () => {
    expect(() => assert(string(), "a", { subject: 1 as never })).toThrow(
      new TypeError("subject must be a string, received number"),
    );
    expect(() => assert(string(), 1, { messages: [] as never })).toThrow(/messages must be a message map/);
  });

  it("should reject messages that are not a map for an input that is valid too", () => {
    expect(() => assert(string(), "a", { messages: [] as never })).toThrow(/messages must be a message map/);
    expect(() => assert(string(), "a", { messages: null as never })).toThrow(/messages must be a message map/);
  });
});
