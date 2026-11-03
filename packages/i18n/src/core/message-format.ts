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
const MAX_NESTING = 10;

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
    let text = "";
    const flush = (): void => {
      if (text.length > 0) {
        nodes.push({ kind: "text", text });
        text = "";
      }
    };

    while (this.index < this.message.length) {
      const character = this.peek()!;

      if (character === "'") {
        text += this.readApostrophe(isInPlural);
      } else if (character === "{") {
        flush();
        nodes.push(this.parseArgument(depth, isInPlural));
      } else if (character === "}") {
        break;
      } else if (character === "#" && isInPlural) {
        flush();
        nodes.push({ kind: "pound" });
        this.index += 1;
      } else {
        text += character;
        this.index += 1;
      }
    }

    flush();
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
    let quoted = "";
    while (this.index < this.message.length) {
      if (this.peek() === "'") {
        if (this.peek(1) === "'") {
          quoted += "'";
          this.index += 2;
          continue;
        }
        this.index += 1;
        return quoted;
      }
      quoted += this.peek();
      this.index += 1;
    }
    // ICU quotes to the end of the message when the closing apostrophe is missing.
    return quoted;
  }

  private parseArgument(depth: number, isInPlural: boolean): MessageNode {
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
          if (key.startsWith("=") ? !/^=-?[0-9]+(\.[0-9]+)?$/.test(key) : !PLURAL_KEYWORDS.has(key)) {
            this.fail(`Unknown plural form ${key}`);
          }
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
        const options = this.parseOptions(depth, isInPlural, () => undefined);
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

  private parseOptions(
    depth: number,
    isInPlural: boolean,
    checkKey: (key: string) => void,
  ): Map<string, readonly MessageNode[]> {
    const options = new Map<string, readonly MessageNode[]>();

    for (;;) {
      this.skipSpace();
      if (this.peek() === "}") {
        this.index += 1;
        break;
      }

      let key: string;
      if (this.peek() === "=") {
        this.index += 1;
        key = `=${this.readWhile(/[-0-9.]/)}`;
      } else {
        key = this.readWhile(SELECT_KEY_PATTERN);
      }
      if (key.length === 0 || key === "=") {
        this.fail("Expected an option");
      }
      checkKey(key);
      if (options.has(key)) {
        this.fail(`Repeated option ${key}`);
      }
      this.expect("{");
      options.set(key, this.parseNodes(depth + 1, isInPlural));
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
const parsedMessages = new Map<string, Message | MessageSyntaxError>();

/**
 * Parses a message once, keeping recent results, since dictionary texts repeat across lookups and managers.
 *
 * @internal
 */
export const parseCachedMessage = (message: string): Message | MessageSyntaxError => {
  let parsed = parsedMessages.get(message);

  if (parsed === undefined) {
    try {
      parsed = parseMessage(message);
    } catch (error) {
      if (!(error instanceof MessageSyntaxError)) {
        throw error;
      }
      parsed = error;
    }
    if (parsedMessages.size >= MAX_CACHED_MESSAGES) {
      parsedMessages.delete(parsedMessages.keys().next().value!);
    }
    parsedMessages.set(message, parsed);
  }

  return parsed;
};

/** Whether a message can only be plain text, so it needs no parsing. @internal */
export const isPlainMessage = (message: string): boolean => !message.includes("{") && !message.includes("'");

const MAX_CACHED_FORMATTERS = 500;
const formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.PluralRules | undefined>();

const cachedFormatter = <T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.PluralRules>(
  key: string,
  create: () => T,
): T => {
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

/** @internal */
export const getNumberFormat = (locale: string, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat =>
  cachedFormatter(`n\0${locale}\0${JSON.stringify(options)}`, () => new Intl.NumberFormat(intlLocale(locale), options));

/** @internal */
export const getDateTimeFormat = (locale: string, options: Intl.DateTimeFormatOptions = {}): Intl.DateTimeFormat =>
  cachedFormatter(
    `d\0${locale}\0${JSON.stringify(options)}`,
    () => new Intl.DateTimeFormat(intlLocale(locale), options),
  );

const getPluralRules = (locale: string, isOrdinal: boolean): Intl.PluralRules =>
  cachedFormatter(
    `p\0${locale}\0${isOrdinal}`,
    () => new Intl.PluralRules(intlLocale(locale), { type: isOrdinal ? "ordinal" : "cardinal" }),
  );

const isDateValue = (value: unknown): value is Date | number =>
  (value instanceof Date && !Number.isNaN(value.getTime())) || (typeof value === "number" && Number.isFinite(value));

const formatNodes = (nodes: Message, values: MessageValues, locale: string, pound: number | undefined): string => {
  let result = "";

  for (const node of nodes) {
    if (node.kind === "text") {
      result += node.text;
      continue;
    }
    if (node.kind === "pound") {
      result += pound === undefined ? "#" : getNumberFormat(locale).format(pound);
      continue;
    }

    const value: unknown = Object.hasOwn(values, node.name) ? values[node.name] : undefined;

    switch (node.kind) {
      case "argument":
        result +=
          typeof value === "string" || typeof value === "number"
            ? String(value)
            : value instanceof Date && isDateValue(value)
              ? getDateTimeFormat(locale, { dateStyle: "medium" }).format(value)
              : node.source;
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
      case "time":
        result += isDateValue(value)
          ? getDateTimeFormat(
              locale,
              node.kind === "date" ? { dateStyle: node.style } : { timeStyle: node.style },
            ).format(value)
          : node.source;
        break;
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
        result += formatNodes(option, values, locale, value - node.offset);
        break;
      }
      case "select": {
        if (typeof value !== "string" && typeof value !== "number") {
          result += node.source;
          break;
        }
        const option = node.options.get(String(value)) ?? node.options.get("other")!;
        result += formatNodes(option, values, locale, pound);
        break;
      }
    }
  }

  return result;
};

/**
 * Formats a parsed message. An argument without a usable value is left as written.
 *
 * @internal
 */
export const formatMessage = (message: Message, values: MessageValues, locale: string): string =>
  formatNodes(message, values, locale, undefined);
