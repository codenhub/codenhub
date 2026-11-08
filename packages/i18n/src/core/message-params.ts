/**
 * Type-level reading of ICU messages, so `t()` can require the values a literal message uses. A message TypeScript sees
 * only as `string`, such as one from a JSON import, or one these types can't read, accepts any values, as before.
 *
 * Each step handles one brace, apostrophe, name character, or space around a name or format. TypeScript stops a
 * tail-recursive type after 1,000 steps with "Type instantiation is excessively deep" (TS2589), which a long message,
 * such as one with 1,100 apostrophes, 600 arguments, or 1,100 spaces inside one argument, would reach, so a reading
 * gives up after a step budget and the message accepts any values.
 */

type MessageValue = string | number | Date;
type AnyValues = Readonly<Record<string, MessageValue>>;

/** Marks a message these types can't read. */
declare const unreadable: unique symbol;
type Unreadable = typeof unreadable;

// Below TypeScript's 1,000, leaving room for the types that lead into a reading.
type MaxSteps = 900;
type Steps = readonly unknown[];
type Next<TSteps extends Steps> = [...TSteps, unknown];

// What the runtime parser skips: JavaScript's `\s`, Unicode spaces and line terminators included.
type Space =
  | " "
  | "\t"
  | "\n"
  | "\v"
  | "\f"
  | "\r"
  | "\u00a0"
  | "\u1680"
  | "\u2000"
  | "\u2001"
  | "\u2002"
  | "\u2003"
  | "\u2004"
  | "\u2005"
  | "\u2006"
  | "\u2007"
  | "\u2008"
  | "\u2009"
  | "\u200a"
  | "\u2028"
  | "\u2029"
  | "\u202f"
  | "\u205f"
  | "\u3000"
  | "\ufeff";
type TrimStart<S extends string, TSteps extends Steps = []> = TSteps["length"] extends MaxSteps
  ? Unreadable
  : S extends `${Space}${infer R}`
    ? TrimStart<R, Next<TSteps>>
    : S;
type TrimEnd<S extends string, TSteps extends Steps = []> = TSteps["length"] extends MaxSteps
  ? Unreadable
  : S extends `${infer R}${Space}`
    ? TrimEnd<R, Next<TSteps>>
    : S;
// Each side has its own budget, since neither recursion continues the other's.
type Trim<S extends string> = TrimStart<S> extends infer T extends string ? TrimEnd<T> : Unreadable;

// An apostrophe before a brace quotes text up to the next lone apostrophe; `''` is one apostrophe, in quoted text too.
type StripQuotes<
  S extends string,
  Out extends string = "",
  TSteps extends Steps = [],
> = TSteps["length"] extends MaxSteps
  ? Unreadable
  : S extends `${infer A}'${infer B}`
    ? B extends `'${infer C}`
      ? StripQuotes<C, `${Out}${A}`, Next<TSteps>>
      : B extends `{${string}` | `}${string}`
        ? SkipQuoted<B, `${Out}${A}`, Next<TSteps>>
        : StripQuotes<B, `${Out}${A}`, Next<TSteps>>
    : `${Out}${S}`;

// Quoted text runs to the end of the message when its closing apostrophe is missing, as at runtime.
type SkipQuoted<S extends string, Out extends string, TSteps extends Steps> = TSteps["length"] extends MaxSteps
  ? Unreadable
  : S extends `${string}'${infer C}`
    ? C extends `'${infer D}`
      ? SkipQuoted<D, Out, Next<TSteps>>
      : StripQuotes<C, Out, Next<TSteps>>
    : Out;

// The next brace, the text before it, and the text after it.
type NextBrace<S extends string> = S extends `${infer A}{${infer B}`
  ? A extends `${infer A1}}${infer A2}`
    ? ["}", A1, `${A2}{${B}`]
    : ["{", A, B]
  : S extends `${infer A}}${infer B}`
    ? ["}", A, B]
    : undefined;

type ValueOfType<T> = T extends "number" | "plural" | "selectordinal"
  ? number
  : T extends "date" | "time"
    ? Date | number
    : T extends "select"
      ? string | number
      : Unreadable;

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Letter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type NameCharacter = Digit | Letter | Uppercase<Letter> | "_";

// The runtime reads only ASCII letters, digits, and `_` as a name, so a message with `{first-name}` is invalid syntax.
type IsName<N, TSteps extends Steps = []> = TSteps["length"] extends MaxSteps
  ? false
  : N extends `${infer C}${infer R}`
    ? C extends NameCharacter
      ? R extends ""
        ? true
        : IsName<R, Next<TSteps>>
      : false
    : false;

// "m" is message text, where `{` starts an argument; "o" is a plural or select's options, where `{` starts a message.
type Frame = "m" | "o";

type Scan<
  S extends string,
  Stack extends readonly Frame[],
  Acc,
  TSteps extends Steps,
> = TSteps["length"] extends MaxSteps
  ? Unreadable
  : NextBrace<S> extends [infer Brace, string, infer Rest extends string]
    ? Stack extends readonly [...infer Up extends readonly Frame[], infer Top]
      ? Brace extends "{"
        ? Top extends "m"
          ? ReadArgument<Rest, Stack, Acc, Next<TSteps>>
          : Scan<Rest, [...Stack, "m"], Acc, Next<TSteps>>
        : Up extends readonly []
          ? Unreadable
          : Scan<Rest, Up, Acc, Next<TSteps>>
      : Unreadable
    : Stack extends readonly ["m"]
      ? Acc
      : Unreadable;

type ReadArgument<
  S extends string,
  Stack extends readonly Frame[],
  Acc,
  TSteps extends Steps,
> = TSteps["length"] extends MaxSteps
  ? Unreadable
  : S extends `${infer N}}${infer After}`
    ? N extends `${string},${string}`
      ? ReadTypedArgument<S, Stack, Acc, Next<TSteps>>
      : IsName<Trim<N>> extends true
        ? Scan<After, Stack, Acc & { readonly [P in Trim<N>]: MessageValue }, Next<TSteps>>
        : Unreadable
    : Unreadable;

type ReadTypedArgument<
  S extends string,
  Stack extends readonly Frame[],
  Acc,
  TSteps extends Steps,
> = TSteps["length"] extends MaxSteps
  ? Unreadable
  : S extends `${infer N},${infer R}`
    ? IsName<Trim<N>> extends true
      ? R extends `${infer T}}${infer After}`
        ? T extends `${string}${"," | "{"}${string}`
          ? R extends `${infer T2},${infer Style}`
            ? ValueOfType<Trim<T2>> extends Unreadable
              ? Unreadable
              : Trim<T2> extends "plural" | "selectordinal" | "select"
                ? Scan<Style, [...Stack, "o"], Acc & { readonly [P in Trim<N>]: ValueOfType<Trim<T2>> }, Next<TSteps>>
                : Style extends `${string}}${infer After2}`
                  ? Scan<After2, Stack, Acc & { readonly [P in Trim<N>]: ValueOfType<Trim<T2>> }, Next<TSteps>>
                  : Unreadable
            : Unreadable
          : ValueOfType<Trim<T>> extends Unreadable
            ? Unreadable
            : Scan<After, Stack, Acc & { readonly [P in Trim<N>]: ValueOfType<Trim<T>> }, Next<TSteps>>
        : Unreadable
      : Unreadable
    : Unreadable;

/** The arguments of one message, `Unreadable` when it can't be read, or `{}` when it has none. */
type MessageArguments<S> = S extends string
  ? string extends S
    ? Unreadable
    : StripQuotes<S> extends infer Text extends string
      ? Scan<Text, ["m"], {}, []>
      : Unreadable
  : Unreadable;

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void
  ? I
  : never;

// A plural group's forms share their arguments, and `count` picks the form.
type ValueArguments<V> = V extends string
  ? MessageArguments<V>
  : V extends { readonly other: string }
    ? Unreadable extends FormArguments<V>
      ? Unreadable
      : UnionToIntersection<FormArguments<V>> & { readonly count: number }
    : Unreadable;
type FormArguments<V> = { [K in keyof V]-?: MessageArguments<V[K]> }[keyof V];

// The value at a dot-separated key, or never in a dictionary without it, which falls back to another for that key.
type ValueAt<T, K extends string> = T extends object
  ? K extends keyof T
    ? T[K]
    : K extends `${infer Head}.${infer Rest}`
      ? Head extends keyof T
        ? ValueAt<T[Head], Rest>
        : never
      : never
  : never;

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

// An argument used twice, such as `{count}` and `{count, plural, …}`, takes the narrower type.
type Narrow<T> = [T] extends [number]
  ? number
  : [T] extends [Date | number]
    ? Date | number
    : [T] extends [string | number]
      ? string | number
      : T;
type Simplify<T> = { readonly [K in keyof T]: Narrow<T[K]> } & {};

// Any dictionary whose message can't be read makes the values loose; otherwise every dictionary's arguments apply.
type ParamsFor<U> = Unreadable extends U ? [params?: AnyValues] : ParamsOf<UnionToIntersection<U>>;
type ParamsOf<A> = keyof A extends never ? [params?: AnyValues] : [params: Readonly<Simplify<A>> & AnyValues];

/**
 * The parameters `t(key, …)` takes: required values when every dictionary type's message at `key` is a literal with
 * arguments, otherwise optional values of any name.
 *
 * @internal
 */
export type TranslateParams<TMessages, TKey extends string> = unknown extends TMessages
  ? [params?: AnyValues]
  : IsUnion<TKey> extends true
    ? [params?: AnyValues]
    : string extends TKey
      ? [params?: AnyValues]
      : ParamsFor<ValueArguments<ValueAt<TMessages, TKey>>>;
