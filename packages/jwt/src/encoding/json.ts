import { MAX_JSON_DEPTH } from "../core/limits";
import { fail, ok } from "../core/result";
import type { JwtIssue, JwtPathSegment, JwtResult } from "../core/types";
import { decodeUtf8 } from "./text";

/** A parsed JSON object: plain, with `Object.prototype`, and deep-frozen. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** Stops the parse with the issue it found; caught at the parser's boundary and never escapes it. */
class JsonRejection {
  constructor(readonly issue: Omit<JwtIssue, "path">) {}
}

const MALFORMED = new JsonRejection({ code: "malformed" });
const DUPLICATE_KEY = new JsonRejection({ code: "duplicate_key" });
const TOO_DEEP = new JsonRejection({ code: "too_large", params: { limit: "depth", maximum: MAX_JSON_DEPTH } });

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const OPEN_OBJECT = 0x7b;
const CLOSE_OBJECT = 0x7d;
const OPEN_ARRAY = 0x5b;
const CLOSE_ARRAY = 0x5d;
const MINUS = 0x2d;
const PLUS = 0x2b;
const DOT = 0x2e;
const ZERO = 0x30;
const NINE = 0x39;
const FIRST_NON_CONTROL = 0x20;

/** The character each single-letter escape stands for (RFC 8259 §7). */
const SHORT_ESCAPES: Readonly<Record<number, string>> = {
  0x22: '"',
  0x5c: "\\",
  0x2f: "/",
  0x62: "\b",
  0x66: "\f",
  0x6e: "\n",
  0x72: "\r",
  0x74: "\t",
};

const isDigit = (code: number): boolean => code >= ZERO && code <= NINE;

/** The value of a hexadecimal digit, or -1. */
function hexValue(code: number): number {
  if (isDigit(code)) {
    return code - ZERO;
  }
  const lower = code | 0x20;
  return lower >= 0x61 && lower <= 0x66 ? lower - 0x61 + 10 : -1;
}

/** An open object waiting for the value of `key`, or an open array waiting for its next item. */
type OpenContainer =
  | { readonly kind: "object"; readonly target: Record<string, unknown>; key: string }
  | { readonly kind: "array"; readonly target: unknown[] };

/**
 * A single-use RFC 8259 parser over decoded text. It accepts what `JSON.parse` accepts and builds the
 * same value, but rejects a repeated member name at any depth, which `JSON.parse` resolves silently by
 * keeping the last, and nesting past {@link MAX_JSON_DEPTH}. Open containers live on an explicit stack,
 * so no input can overflow the call stack, and every character is read a bounded number of times.
 */
class StrictJsonParser {
  private position = 0;
  private readonly stack: OpenContainer[] = [];

  constructor(private readonly text: string) {}

  parseObject(): JsonObject {
    this.skipWhitespace();
    if (this.peek() !== OPEN_OBJECT) {
      throw MALFORMED;
    }
    return this.parseValue() as JsonObject;
  }

  private parseValue(): unknown {
    for (;;) {
      this.skipWhitespace();
      let value: unknown;
      const code = this.peek();
      if (code === OPEN_OBJECT || code === OPEN_ARRAY) {
        if (this.stack.length >= MAX_JSON_DEPTH) {
          throw TOO_DEEP;
        }
        this.position++;
        const opened = code === OPEN_OBJECT ? this.openObject() : this.openArray();
        if (opened === undefined) {
          // The container has started and its first value is next.
          continue;
        }
        value = opened;
      } else if (code === QUOTE) {
        value = this.readString();
      } else if (code === MINUS || isDigit(code)) {
        value = this.readNumber();
      } else {
        value = this.readLiteral();
      }
      const next = this.attach(value);
      if (next === "value") {
        continue;
      }
      return next.value;
    }
  }

  /** Opens an object, returning it frozen when it is empty, or undefined when its first member's value is next. */
  private openObject(): object | undefined {
    const target: Record<string, unknown> = {};
    this.skipWhitespace();
    if (this.peek() === CLOSE_OBJECT) {
      this.position++;
      return Object.freeze(target);
    }
    this.stack.push({ kind: "object", target, key: this.readMemberName(target) });
    return undefined;
  }

  /** Opens an array, returning it frozen when it is empty, or undefined when its first item is next. */
  private openArray(): object | undefined {
    const target: unknown[] = [];
    this.skipWhitespace();
    if (this.peek() === CLOSE_ARRAY) {
      this.position++;
      return Object.freeze(target);
    }
    this.stack.push({ kind: "array", target });
    return undefined;
  }

  /**
   * Places a finished value in the open container and reads what follows it, closing containers as they
   * end. Returns "value" when another value is due, or the finished top-level value.
   */
  private attach(finished: unknown): "value" | { value: unknown } {
    let value = finished;
    for (;;) {
      const open = this.stack.at(-1);
      if (open === undefined) {
        this.skipWhitespace();
        if (this.position !== this.text.length) {
          throw MALFORMED;
        }
        return { value };
      }
      if (open.kind === "object") {
        // Defined, not assigned, so `__proto__` becomes an own member as with `JSON.parse`, and a setter
        // added to `Object.prototype` never runs.
        Object.defineProperty(open.target, open.key, { value, writable: true, enumerable: true, configurable: true });
      } else {
        open.target.push(value);
      }
      this.skipWhitespace();
      const code = this.peek();
      this.position++;
      if (code === COMMA) {
        if (open.kind === "object") {
          this.skipWhitespace();
          open.key = this.readMemberName(open.target);
        }
        return "value";
      }
      if (code !== (open.kind === "object" ? CLOSE_OBJECT : CLOSE_ARRAY)) {
        throw MALFORMED;
      }
      this.stack.pop();
      value = Object.freeze(open.target);
    }
  }

  /** Reads `"name" :`, rejecting a name the object already has, however either was escaped. */
  private readMemberName(target: Record<string, unknown>): string {
    if (this.peek() !== QUOTE) {
      throw MALFORMED;
    }
    const name = this.readString();
    if (Object.hasOwn(target, name)) {
      throw DUPLICATE_KEY;
    }
    this.skipWhitespace();
    if (this.peek() !== COLON) {
      throw MALFORMED;
    }
    this.position++;
    return name;
  }

  /** Reads a string starting at its opening quote. Lone surrogate escapes are kept, as `JSON.parse` keeps them. */
  private readString(): string {
    const { text } = this;
    this.position++;
    let result = "";
    let runStart = this.position;
    for (;;) {
      if (this.position >= text.length) {
        throw MALFORMED;
      }
      const code = text.charCodeAt(this.position);
      if (code === QUOTE) {
        result += text.slice(runStart, this.position);
        this.position++;
        return result;
      }
      if (code === BACKSLASH) {
        result += text.slice(runStart, this.position) + this.readEscape();
        runStart = this.position;
      } else if (code < FIRST_NON_CONTROL) {
        throw MALFORMED;
      } else {
        this.position++;
      }
    }
  }

  /** Reads an escape starting at its backslash and returns the character it stands for. */
  private readEscape(): string {
    const letter = this.text.charCodeAt(this.position + 1);
    this.position += 2;
    const short = SHORT_ESCAPES[letter];
    if (short !== undefined) {
      return short;
    }
    if (letter !== 0x75) {
      throw MALFORMED;
    }
    let unit = 0;
    for (let index = 0; index < 4; index++) {
      const digit = hexValue(this.text.charCodeAt(this.position + index));
      if (digit < 0) {
        throw MALFORMED;
      }
      unit = unit * 16 + digit;
    }
    this.position += 4;
    return String.fromCharCode(unit);
  }

  /** Reads `-? (0 | [1-9][0-9]*) (. [0-9]+)? ([eE] [+-]? [0-9]+)?` and converts the lexeme as `JSON.parse` does. */
  private readNumber(): number {
    const start = this.position;
    if (this.peek() === MINUS) {
      this.position++;
    }
    if (this.peek() === ZERO) {
      this.position++;
    } else {
      this.readDigits();
    }
    if (this.peek() === DOT) {
      this.position++;
      this.readDigits();
    }
    if ((this.peek() | 0x20) === 0x65) {
      this.position++;
      if (this.peek() === PLUS || this.peek() === MINUS) {
        this.position++;
      }
      this.readDigits();
    }
    return Number(this.text.slice(start, this.position));
  }

  /** Reads one or more digits. */
  private readDigits(): void {
    const start = this.position;
    while (isDigit(this.peek())) {
      this.position++;
    }
    if (this.position === start) {
      throw MALFORMED;
    }
  }

  private readLiteral(): boolean | null {
    for (const [word, value] of LITERALS) {
      if (this.text.startsWith(word, this.position)) {
        this.position += word.length;
        return value;
      }
    }
    throw MALFORMED;
  }

  /** Skips the four whitespace characters JSON allows; a byte order mark or other space is not one of them. */
  private skipWhitespace(): void {
    for (;;) {
      const code = this.peek();
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
        return;
      }
      this.position++;
    }
  }

  /** The character code at the current position, or NaN past the end, which matches no character. */
  private peek(): number {
    return this.text.charCodeAt(this.position);
  }
}

const LITERALS: readonly (readonly [string, boolean | null])[] = [
  ["true", true],
  ["false", false],
  ["null", null],
];

/**
 * Parses UTF-8 bytes that must hold one JSON object into a deep-frozen value equal to what `JSON.parse`
 * returns for the same text.
 *
 * @param bytes - The encoded JSON. A byte order mark, invalid UTF-8, or a top level other than an object
 * is `malformed`.
 * @param path - Where the issue points, such as `["header"]`. Defaults to the whole input.
 * @returns The object, or a failure with `malformed`, `duplicate_key` for a member name repeated in any
 * one object, or `too_large` with `{ limit: "depth", maximum }` for nesting past {@link MAX_JSON_DEPTH}.
 */
export function parseJsonObject(bytes: Uint8Array, path?: readonly JwtPathSegment[]): JwtResult<JsonObject> {
  const text = decodeUtf8(bytes);
  const atPath = (issue: Omit<JwtIssue, "path">): JwtIssue => (path === undefined ? issue : { ...issue, path });
  if (text === undefined) {
    return fail(atPath(MALFORMED.issue));
  }
  try {
    return ok(new StrictJsonParser(text).parseObject());
  } catch (error) {
    if (error instanceof JsonRejection) {
      return fail(atPath(error.issue));
    }
    throw error;
  }
}
