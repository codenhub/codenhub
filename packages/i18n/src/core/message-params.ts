/**
 * Type-level reading of ICU messages, so `t()` can require the values a literal message uses. A message TypeScript sees
 * only as `string`, such as one from a JSON import, or one these types can't read, accepts any values, as before.
 *
 * Each step handles one brace or apostrophe, so a message stays well under TypeScript's 1,000-step limit for
 * tail-recursive types.
 */

type MessageValue = string | number | Date;
type AnyValues = Readonly<Record<string, MessageValue>>;

/** Marks a message these types can't read. */
declare const unreadable: unique symbol;
type Unreadable = typeof unreadable;

type Space = " " | "\n" | "\t" | "\r";
type TrimStart<S extends string> = S extends `${Space}${infer R}` ? TrimStart<R> : S;
type TrimEnd<S extends string> = S extends `${infer R}${Space}` ? TrimEnd<R> : S;
type Trim<S extends string> = TrimEnd<TrimStart<S>>;

// An apostrophe before a brace quotes text up to the next apostrophe; any other apostrophe is text.
type StripQuotes<S extends string, Out extends string = ""> = S extends `${infer A}'${infer B}`
  ? B extends `'${infer C}`
    ? StripQuotes<C, `${Out}${A}`>
    : B extends `{${string}` | `}${string}`
      ? B extends `${string}'${infer C}`
        ? StripQuotes<C, `${Out}${A}`>
        : `${Out}${A}`
      : StripQuotes<B, `${Out}${A}`>
  : `${Out}${S}`;

// The next brace, the text before it, and the text after it.
type NextBrace<S extends string> = S extends `${infer A}{${infer B}`
  ? A extends `${infer A1}}${infer A2}`
    ? ["}", A1, `${A2}{${B}`]
    : ["{", A, B]
  : S extends `${infer A}}${infer B}`
    ? ["}", A, B]
    : undefined;

type ValueOfType<T extends string> = T extends "number" | "plural" | "selectordinal"
  ? number
  : T extends "date" | "time"
    ? Date | number
    : T extends "select"
      ? string | number
      : Unreadable;

type IsName<N extends string> = N extends "" | `${string}${Space | "{" | "}" | ","}${string}` ? false : true;

// "m" is message text, where `{` starts an argument; "o" is a plural or select's options, where `{` starts a message.
type Frame = "m" | "o";

type Scan<S extends string, Stack extends readonly Frame[], Acc> =
  NextBrace<S> extends [infer Brace, string, infer Rest extends string]
    ? Stack extends readonly [...infer Up extends readonly Frame[], infer Top]
      ? Brace extends "{"
        ? Top extends "m"
          ? ReadArgument<Rest, Stack, Acc>
          : Scan<Rest, [...Stack, "m"], Acc>
        : Up extends readonly []
          ? Unreadable
          : Scan<Rest, Up, Acc>
      : Unreadable
    : Stack extends readonly ["m"]
      ? Acc
      : Unreadable;

type ReadArgument<S extends string, Stack extends readonly Frame[], Acc> = S extends `${infer N}}${infer After}`
  ? N extends `${string},${string}`
    ? ReadTypedArgument<S, Stack, Acc>
    : IsName<Trim<N>> extends true
      ? Scan<After, Stack, Acc & { readonly [P in Trim<N>]: MessageValue }>
      : Unreadable
  : Unreadable;

type ReadTypedArgument<S extends string, Stack extends readonly Frame[], Acc> = S extends `${infer N},${infer R}`
  ? IsName<Trim<N>> extends true
    ? R extends `${infer T}}${infer After}`
      ? T extends `${string}${"," | "{"}${string}`
        ? R extends `${infer T2},${infer Style}`
          ? ValueOfType<Trim<T2>> extends Unreadable
            ? Unreadable
            : Trim<T2> extends "plural" | "selectordinal" | "select"
              ? Scan<Style, [...Stack, "o"], Acc & { readonly [P in Trim<N>]: ValueOfType<Trim<T2>> }>
              : Style extends `${string}}${infer After2}`
                ? Scan<After2, Stack, Acc & { readonly [P in Trim<N>]: ValueOfType<Trim<T2>> }>
                : Unreadable
          : Unreadable
        : ValueOfType<Trim<T>> extends Unreadable
          ? Unreadable
          : Scan<After, Stack, Acc & { readonly [P in Trim<N>]: ValueOfType<Trim<T>> }>
      : Unreadable
    : Unreadable
  : Unreadable;

/** The arguments of one message, `Unreadable` when it can't be read, or `{}` when it has none. */
type MessageArguments<S> = S extends string
  ? string extends S
    ? Unreadable
    : Scan<StripQuotes<S>, ["m"], {}>
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
