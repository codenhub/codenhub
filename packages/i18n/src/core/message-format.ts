/**
 * A subset of ICU MessageFormat: `{name}`, `{name, number}`, `{name, date}`, `{name, time}`, `{name, plural, …}`,
 * `{name, selectordinal, …}`, and `{name, select, …}`, with ICU apostrophe quoting.
 *
 * @internal
 */

/** A value a message argument accepts. @internal */
export type MessageValue = string | number | Date;

/** Values for a message's arguments, read from own properties. @internal */
export type MessageValues = Readonly<Record<string, MessageValue>>;

const NUMBER_STYLES = ["integer", "percent"] as const;
const DATE_STYLES = ["short", "medium", "long", "full"] as const;
const PLURAL_KEYWORDS = new Set(["zero", "one", "two", "few", "many", "other"]);
const NAME_PATTERN = /[A-Za-z0-9_]/;
const SELECT_KEY_PATTERN = /[A-Za-z0-9_-]/;
const EXACT_VALUE_PATTERN = /^=-?[0-9]+(\.[0-9]+)?$/;
const MAX_NESTING = 10;
// What a parsed message keeps, in characters of its text, which V8 keeps at about 2 bytes each. Measured on Node.js
// 26.13: a node, such as `{a}` or `#`, keeps 47 to 140 bytes, and a plural or select keeps about 330 bytes with one
// option, its node, option map, and option list, each option after the first about 70.
const NODE_COST = 64;
const OPTIONS_COST = 128;
const OPTION_COST = 64;

type MessageNode =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "pound" }
  | { readonly kind: "argument"; readonly name: string; readonly source: string }
  | {
      readonly kind: "number";
      readonly name: string;
      readonly style: (typeof NUMBER_STYLES)[number] | undefined;
      readonly source: string;
    }
  | {
      readonly kind: "date" | "time";
      readonly name: string;
      readonly style: (typeof DATE_STYLES)[number];
      readonly source: string;
    }
  | {
      readonly kind: "plural";
      readonly name: string;
      readonly isOrdinal: boolean;
      readonly offset: number;
      readonly options: ReadonlyMap<string, readonly MessageNode[]>;
      readonly source: string;
    }
  | {
      readonly kind: "select";
      readonly name: string;
      readonly options: ReadonlyMap<string, readonly MessageNode[]>;
      readonly source: string;
    };

/** A parsed message. @internal */
export type Message = readonly MessageNode[];

/** Thrown for a message that is not valid ICU syntax. @internal */
export class MessageSyntaxError extends Error {}

class Parser {
  private index = 0;
  /** The memory the parsed nodes keep, in characters, for the cache to count; see `NODE_COST`. */
  cost = 0;
  private readonly message: string;

  constructor(message: string) {
    this.message = message;
  }

  parse(): Message {
    const nodes = this.parseNodes(0, false);
    if (this.index < this.message.length) {
      this.fail("Unexpected }");
    }
    return nodes;
  }

  private fail(reason: string): never {
    throw new MessageSyntaxError(`${reason} at character ${this.index + 1}`);
  }

  private peek(offset = 0): string | undefined {
    return this.message[this.index + offset];
  }

  private skipSpace(): void {
    while (/\s/.test(this.peek() ?? "")) {
      this.index += 1;
    }
  }

  private expect(character: string): void {
    this.skipSpace();
    if (this.peek() !== character) {
      this.fail(`Expected ${character}`);
    }
    this.index += 1;
  }

  private readWhile(pattern: RegExp): string {
    const start = this.index;
    while (pattern.test(this.peek() ?? "")) {
      this.index += 1;
    }
    return this.message.slice(start, this.index);
  }

  /** Reads text and arguments until an unmatched `}` or the end. */
  private parseNodes(depth: number, isInPlural: boolean): MessageNode[] {
    if (depth > MAX_NESTING) {
      this.fail("Too deeply nested");
    }

    const nodes: MessageNode[] = [];
    // Text is gathered as slices and joined once: appending one character at a time leaves V8 a chain of string
    // pieces that the cache keeps at about 30 bytes per character.
    let parts: string[] = [];
    let runStart = this.index;
    const endRun = (): void => {
      if (this.index > runStart) {
        parts.push(this.message.slice(runStart, this.index));
      }
    };
    const flush = (): void => {
      if (parts.length > 0) {
        nodes.push({ kind: "text", text: parts.join("") });
        parts = [];
      }
    };

    while (this.index < this.message.length) {
      const character = this.peek()!;

      if (character === "'") {
        endRun();
        parts.push(this.readApostrophe(isInPlural));
      } else if (character === "{") {
        endRun();
        flush();
        nodes.push(this.parseArgument(depth));
      } else if (character === "}") {
        break;
      } else if (character === "#" && isInPlural) {
        endRun();
        flush();
        nodes.push({ kind: "pound" });
        this.index += 1;
      } else {
        this.index += 1;
        continue;
      }
      runStart = this.index;
    }

    endRun();
    flush();
    this.cost += nodes.length * NODE_COST;
    return nodes;
  }

  /** ICU quoting: `''` is one apostrophe, and `'` before a special character quotes until the next lone `'`. */
  private readApostrophe(isInPlural: boolean): string {
    const next = this.peek(1);

    if (next === "'") {
      this.index += 2;
      return "'";
    }
    if (next !== "{" && next !== "}" && !(next === "#" && isInPlural)) {
      this.index += 1;
      return "'";
    }

    this.index += 1;
    const parts: string[] = [];
    let runStart = this.index;
    while (this.index < this.message.length) {
      if (this.peek() === "'") {
        parts.push(this.message.slice(runStart, this.index));
        if (this.peek(1) === "'") {
          parts.push("'");
          this.index += 2;
          runStart = this.index;
          continue;
        }
        this.index += 1;
        return parts.join("");
      }
      this.index += 1;
    }
    // ICU quotes to the end of the message when the closing apostrophe is missing.
    parts.push(this.message.slice(runStart));
    return parts.join("");
  }

  private parseArgument(depth: number): MessageNode {
    const start = this.index;
    this.index += 1;
    this.skipSpace();
    const name = this.readWhile(NAME_PATTERN);
    if (name.length === 0) {
      this.fail("Expected an argument name");
    }
    this.skipSpace();

    if (this.peek() === "}") {
      this.index += 1;
      return { kind: "argument", name, source: this.message.slice(start, this.index) };
    }

    this.expect(",");
    this.skipSpace();
    const type = this.readWhile(/[a-z]/);
    this.skipSpace();

    switch (type) {
      case "number": {
        const style = this.parseStyle(NUMBER_STYLES);
        return { kind: "number", name, style, source: this.message.slice(start, this.index) };
      }
      case "date":
      case "time": {
        const style = this.parseStyle(DATE_STYLES) ?? "medium";
        return { kind: type, name, style, source: this.message.slice(start, this.index) };
      }
      case "plural":
      case "selectordinal": {
        this.expect(",");
        this.skipSpace();
        let offset = 0;
        if (this.message.startsWith("offset:", this.index)) {
          this.index += "offset:".length;
          this.skipSpace();
          const digits = this.readWhile(/[0-9]/);
          if (digits.length === 0) {
            this.fail("Expected an offset");
          }
          offset = Number(digits);
        }
        const options = this.parseOptions(depth, true, (key) => {
          if (key.startsWith("=") ? !EXACT_VALUE_PATTERN.test(key) : !PLURAL_KEYWORDS.has(key)) {
            this.fail(`Unknown plural form ${key}`);
          }
          // ICU compares exact values as numbers, so `=1.0` and `=01` select 1, as the value's own spelling does.
          return key.startsWith("=") ? `=${Number(key.slice(1))}` : key;
        });
        return {
          kind: "plural",
          name,
          isOrdinal: type === "selectordinal",
          offset,
          options,
          source: this.message.slice(start, this.index),
        };
      }
      case "select": {
        this.expect(",");
        // ICU reads `#` as the number only in a plural's own options, not in a select nested inside one.
        const options = this.parseOptions(depth, false, (key) => key);
        return { kind: "select", name, options, source: this.message.slice(start, this.index) };
      }
      default:
        return this.fail(`Unknown argument type ${JSON.stringify(type)}`);
    }
  }

  private parseStyle<TStyle extends string>(styles: readonly TStyle[]): TStyle | undefined {
    if (this.peek() === "}") {
      this.index += 1;
      return undefined;
    }

    this.expect(",");
    this.skipSpace();
    const style = this.readWhile(/[a-z]/);
    if (!(styles as readonly string[]).includes(style)) {
      this.fail(`Unknown style ${JSON.stringify(style)}`);
    }
    this.expect("}");
    return style as TStyle;
  }

  /** Reads options until `}`, keyed by `readKey`, which rejects an unknown key or returns the key to store. */
  private parseOptions(
    depth: number,
    isInPlural: boolean,
    readKey: (key: string) => string,
  ): Map<string, readonly MessageNode[]> {
    const options = new Map<string, readonly MessageNode[]>();
    this.cost += OPTIONS_COST;

    for (;;) {
      this.skipSpace();
      if (this.peek() === "}") {
        this.index += 1;
        break;
      }

      let written: string;
      if (this.peek() === "=") {
        this.index += 1;
        written = `=${this.readWhile(/[-0-9.]/)}`;
      } else {
        written = this.readWhile(SELECT_KEY_PATTERN);
      }
      if (written.length === 0 || written === "=") {
        this.fail("Expected an option");
      }
      const key = readKey(written);
      if (options.has(key)) {
        this.fail(`Repeated option ${written}`);
      }
      this.expect("{");
      options.set(key, this.parseNodes(depth + 1, isInPlural));
      this.cost += OPTION_COST;
      this.expect("}");
    }

    if (!options.has("other")) {
      this.fail("Missing the other option");
    }
    return options;
  }
}

/**
 * Parses a message, throwing a `MessageSyntaxError` for invalid syntax.
 *
 * @internal
 */
export const parseMessage = (message: string): Message => new Parser(message).parse();

const MAX_CACHED_MESSAGES = 10_000;
// The cache is shared by every manager in the process, so a server that loads changing dictionaries, such as from a
// CMS, must not keep them all. This is the default dictionary's maxTotalLength, counted as `cachedCost` counts it.
const MAX_CACHED_COST = 5_000_000;
// A cached entry, about 130 bytes on Node.js 26.13.
const ENTRY_COST = 64;

/**
 * A parsed message, or for invalid syntax, the reason, such as `Expected } at character 5`. The cache keeps the reason
 * rather than the error, since an error's stack keeps each frame's receiver, such as the manager that parsed it, with
 * its dictionaries.
 *
 * @internal
 */
export type CachedParse = Message | string;

interface CachedMessage {
  readonly parsed: CachedParse;
  readonly cost: number;
}

const parsedMessages = new Map<string, CachedMessage>();
let cachedCost = 0;

/**
 * What a parsed message keeps in memory, in characters: its text, which the cache holds as its key, plus a fixed cost
 * for every node and option it parsed into, since a text of `#` or `{a}` keeps far more per character than plain text.
 *
 * @internal
 */
export const parseMessageWithCost = (message: string): CachedMessage => {
  const parser = new Parser(message);
  try {
    const parsed = parser.parse();
    return { parsed, cost: ENTRY_COST + message.length + parser.cost };
  } catch (error) {
    if (!(error instanceof MessageSyntaxError)) {
      throw error;
    }
    // The nodes parsed before the error are not kept.
    return { parsed: error.message, cost: ENTRY_COST + message.length + error.message.length };
  }
};

/**
 * Parses a message once, keeping the most recently used results, since dictionary texts repeat across lookups and
 * managers. Returns the parsed message, or for invalid syntax, the reason as a string.
 *
 * @internal
 */
export const parseCachedMessage = (message: string): CachedParse => {
  let cached = parsedMessages.get(message);

  if (cached !== undefined) {
    // Re-inserting moves a hit to the newest end, so eviction drops the least recently used message.
    parsedMessages.delete(message);
    parsedMessages.set(message, cached);
  } else {
    cached = parseMessageWithCost(message);
    if (cached.cost <= MAX_CACHED_COST) {
      while (parsedMessages.size >= MAX_CACHED_MESSAGES || cachedCost + cached.cost > MAX_CACHED_COST) {
        const oldest = parsedMessages.keys().next().value!;
        cachedCost -= parsedMessages.get(oldest)!.cost;
        parsedMessages.delete(oldest);
      }
      parsedMessages.set(message, cached);
      cachedCost += cached.cost;
    }
  }

  return cached.parsed;
};

/**
 * Whether a message can only be plain text, so it needs no parsing. A `}` is parsed too, so a stray one is reported
 * whether or not the text also has an apostrophe.
 *
 * @internal
 */
export const isPlainMessage = (message: string): boolean =>
  !message.includes("{") && !message.includes("}") && !message.includes("'");

const MAX_CACHED_FORMATTERS = 500;
type CachedFormatter =
  | Intl.NumberFormat
  | Intl.DateTimeFormat
  | Intl.PluralRules
  | Intl.RelativeTimeFormat
  | Intl.ListFormat;
const formatters = new Map<string, CachedFormatter>();

// Every option each `Intl` constructor reads, as of ES2025, in the order it reads them, so a getter that depends on an
// earlier read sees the same state as with `Intl` alone.
const NUMBER_FORMAT_OPTIONS = [
  "localeMatcher",
  "numberingSystem",
  "style",
  "currency",
  "currencyDisplay",
  "currencySign",
  "unit",
  "unitDisplay",
  "notation",
  "minimumIntegerDigits",
  "minimumFractionDigits",
  "maximumFractionDigits",
  "minimumSignificantDigits",
  "maximumSignificantDigits",
  "roundingIncrement",
  "roundingMode",
  "roundingPriority",
  "trailingZeroDisplay",
  "compactDisplay",
  "useGrouping",
  "signDisplay",
];
const DATE_TIME_FORMAT_OPTIONS = [
  "localeMatcher",
  "calendar",
  "numberingSystem",
  "hour12",
  "hourCycle",
  "timeZone",
  "weekday",
  "era",
  "year",
  "month",
  "day",
  "dayPeriod",
  "hour",
  "minute",
  "second",
  "fractionalSecondDigits",
  "timeZoneName",
  "formatMatcher",
  "dateStyle",
  "timeStyle",
];
const RELATIVE_TIME_FORMAT_OPTIONS = ["localeMatcher", "numberingSystem", "style", "numeric"];
const LIST_FORMAT_OPTIONS = ["localeMatcher", "type", "style"];

/**
 * Copies the options `Intl` reads, by name and through the prototype chain as `Intl` reads them, so the copy both keys
 * the cache and creates the formatter, and the two always agree.
 */
const copyOptions = (options: object, names: readonly string[]): Record<string, unknown> => {
  const copy: Record<string, unknown> = {};
  for (const name of names) {
    const value: unknown = (options as Record<string, unknown>)[name];
    if (value !== undefined) {
      copy[name] = value;
    }
  }
  return copy;
};

/**
 * Keys copied options whose values are primitives, which `Intl` reads the same way every time, by type and text, so
 * `null` and `NaN` differ. The text is quoted, so a string holding the separator can't spell out another option. Any
 * other value, such as an object with a `toString`, has no key, and its formatter is created each time, so `Intl` checks
 * it each time.
 */
const optionsKey = (copy: Readonly<Record<string, unknown>>): string | undefined => {
  let key = "";
  for (const [name, value] of Object.entries(copy)) {
    if ((typeof value === "object" && value !== null) || typeof value === "function" || typeof value === "symbol") {
      return undefined;
    }
    key += `\0${name}=${typeof value}:${JSON.stringify(String(value))}`;
  }
  return key;
};

/**
 * Copies the options `Intl.DateTimeFormat` reads, including inherited ones, into a plain object.
 *
 * @internal
 */
export const copyDateTimeFormatOptions = (options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormatOptions =>
  copyOptions(options, DATE_TIME_FORMAT_OPTIONS);

const cachedFormatter = <T extends CachedFormatter>(key: string | undefined, create: () => T): T => {
  if (key === undefined) {
    return create();
  }
  let formatter = formatters.get(key) as T | undefined;
  if (formatter === undefined) {
    formatter = create();
    if (formatters.size >= MAX_CACHED_FORMATTERS) {
      formatters.delete(formatters.keys().next().value!);
    }
    formatters.set(key, formatter);
  }
  return formatter;
};

/**
 * Returns a locale `Intl` accepts: the locale itself, or the root locale `und` for one it rejects, such as private-use
 * `x-test`, so formatting never throws for a configured locale.
 *
 * @internal
 */
export const intlLocale = (locale: string): string => {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? "und";
  } catch {
    return "und";
  }
};

const prefixKey = (prefix: string, key: string | undefined): string | undefined =>
  key === undefined ? undefined : `${prefix}${key}`;

/**
 * Whether `Intl` reads named options from `options`; for `null` it throws its own error, which callers keep.
 *
 * @internal
 */
export const isOptionsObject = (options: unknown): options is object =>
  (typeof options === "object" && options !== null) || typeof options === "function";

/** @internal */
export const getNumberFormat = (locale: string, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat => {
  if (!isOptionsObject(options)) {
    return new Intl.NumberFormat(intlLocale(locale), options);
  }
  const copy = copyOptions(options, NUMBER_FORMAT_OPTIONS);
  return cachedFormatter(
    prefixKey(`n\0${locale}`, optionsKey(copy)),
    () => new Intl.NumberFormat(intlLocale(locale), copy),
  );
};

/** @internal */
export const getDateTimeFormat = (locale: string, options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat => {
  if (!isOptionsObject(options)) {
    return new Intl.DateTimeFormat(intlLocale(locale), options);
  }
  const copy = copyOptions(options, DATE_TIME_FORMAT_OPTIONS);
  return cachedFormatter(
    prefixKey(`d\0${locale}`, optionsKey(copy)),
    () => new Intl.DateTimeFormat(intlLocale(locale), copy),
  );
};

/** @internal */
export const getRelativeTimeFormat = (
  locale: string,
  options: Intl.RelativeTimeFormatOptions = {},
): Intl.RelativeTimeFormat => {
  if (!isOptionsObject(options)) {
    return new Intl.RelativeTimeFormat(intlLocale(locale), options);
  }
  const copy = copyOptions(options, RELATIVE_TIME_FORMAT_OPTIONS);
  return cachedFormatter(
    prefixKey(`r\0${locale}`, optionsKey(copy)),
    () => new Intl.RelativeTimeFormat(intlLocale(locale), copy),
  );
};

/** @internal */
export const getListFormat = (locale: string, options: Intl.ListFormatOptions = {}): Intl.ListFormat => {
  if (!isOptionsObject(options)) {
    return new Intl.ListFormat(intlLocale(locale), options);
  }
  const copy = copyOptions(options, LIST_FORMAT_OPTIONS);
  return cachedFormatter(
    prefixKey(`l\0${locale}`, optionsKey(copy)),
    () => new Intl.ListFormat(intlLocale(locale), copy),
  );
};

const getPluralRules = (locale: string, isOrdinal: boolean): Intl.PluralRules =>
  cachedFormatter(
    `p\0${locale}\0${isOrdinal}`,
    () => new Intl.PluralRules(intlLocale(locale), { type: isOrdinal ? "ordinal" : "cardinal" }),
  );

// The largest time a `Date` holds, in milliseconds either side of the epoch. `Intl` throws past it.
const MAX_TIME = 8_640_000_000_000_000;

// A `Date` from any realm, such as an iframe or `node:vm`, which `instanceof` misses, read by its internal slot.
const readDateTime = (value: unknown): number | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    return Date.prototype.getTime.call(value);
  } catch {
    return undefined;
  }
};

// The time a date argument formats, or `undefined` for a value that leaves it as written.
const readTime = (value: unknown): number | undefined => {
  const time = typeof value === "number" ? value : readDateTime(value);
  return time !== undefined && Math.abs(time) <= MAX_TIME ? time : undefined;
};

/**
 * Formats the value of a plain `{name}`: text and numbers as written, a valid `Date` as a medium date, and anything else
 * as `undefined`, for the argument to stay as written.
 *
 * @internal
 */
export const formatPlainValue = (value: unknown, locale: string, timeZone: string | undefined): string | undefined => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  const time = readDateTime(value);
  return time !== undefined && Math.abs(time) <= MAX_TIME
    ? getDateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(time)
    : undefined;
};

/**
 * How many arguments one call fills. Past it, an argument stays as written, so a message that repeats `{a}` can't turn
 * one value into hundreds of megabytes.
 *
 * @internal
 */
export const MAX_FILLED_ARGUMENTS = 100;

interface FormatState {
  readonly values: MessageValues;
  readonly locale: string;
  readonly timeZone: string | undefined;
  filledArguments: number;
}

const formatNodes = (nodes: Message, state: FormatState, pound: number | undefined): string => {
  const { values, locale, timeZone } = state;
  let result = "";
  // Formatted once, so a form that repeats `#` costs no formatting step per `#`, which the argument limit doesn't count.
  let poundText: string | undefined;

  for (const node of nodes) {
    if (node.kind === "text") {
      result += node.text;
      continue;
    }
    if (node.kind === "pound") {
      poundText ??= pound === undefined ? "#" : getNumberFormat(locale).format(pound);
      result += poundText;
      continue;
    }

    if (state.filledArguments >= MAX_FILLED_ARGUMENTS) {
      result += node.source;
      continue;
    }
    state.filledArguments += 1;
    const value: unknown = Object.hasOwn(values, node.name) ? values[node.name] : undefined;

    switch (node.kind) {
      case "argument":
        result += formatPlainValue(value, locale, timeZone) ?? node.source;
        break;
      case "number":
        result +=
          typeof value === "number"
            ? getNumberFormat(
                locale,
                node.style === "percent"
                  ? { style: "percent" }
                  : node.style === "integer"
                    ? { maximumFractionDigits: 0 }
                    : {},
              ).format(value)
            : node.source;
        break;
      case "date":
      case "time": {
        const time = readTime(value);
        result +=
          time === undefined
            ? node.source
            : getDateTimeFormat(
                locale,
                node.kind === "date" ? { dateStyle: node.style, timeZone } : { timeStyle: node.style, timeZone },
              ).format(time);
        break;
      }
      case "plural": {
        if (typeof value !== "number") {
          result += node.source;
          break;
        }
        const exact = node.options.get(`=${value}`);
        // A locale Intl rejects uses `other`, as plural groups do, rather than the root locale's English-like rules.
        const category =
          intlLocale(locale) === "und" ? "other" : getPluralRules(locale, node.isOrdinal).select(value - node.offset);
        const option = exact ?? node.options.get(category) ?? node.options.get("other")!;
        result += formatNodes(option, state, value - node.offset);
        break;
      }
      case "select": {
        if (typeof value !== "string" && typeof value !== "number") {
          result += node.source;
          break;
        }
        const option = node.options.get(String(value)) ?? node.options.get("other")!;
        result += formatNodes(option, state, pound);
        break;
      }
    }
  }

  return result;
};

/**
 * Formats a parsed message, with dates and times in `timeZone`, or the runtime's when `undefined`. An argument without
 * a usable value is left as written.
 *
 * @internal
 */
export const formatMessage = (
  message: Message,
  values: MessageValues,
  locale: string,
  timeZone: string | undefined,
): string => formatNodes(message, { values, locale, timeZone, filledArguments: 0 }, undefined);
