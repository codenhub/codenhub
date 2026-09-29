/*
 * Compiled against the built declarations by consumer-types.test.ts, the way an app installing the
 * package sees it. Every `@ts-expect-error` line must fail to compile, and everything else must not.
 */
import {
  array,
  bigint,
  coerceBigint,
  coerceBoolean,
  coerceDate,
  coerceNumber,
  coerceString,
  date,
  datetime,
  discriminatedUnion,
  email,
  englishMessages,
  fail,
  fallback,
  flatten,
  formatIssue,
  intersection,
  is,
  json,
  lazy,
  literal,
  map,
  nativeEnum,
  nullable,
  number,
  object,
  oneOf,
  optional,
  partial,
  pass,
  pipe,
  record,
  refine,
  set,
  standard,
  string,
  transform,
  tuple,
  union,
  url,
  withDefault,
  type AsyncValidator,
  type Infer,
  type StandardSchemaV1,
  type Validator,
} from "../../../dist/index";

// A schema is the single source of the type. Properties that accept `undefined` become optional.
export const signup = object({
  name: pipe(string({ trim: true }), string({ min: 2 })),
  email: email(),
  age: optional(number({ int: true, min: 18 })),
});
export type Signup = Infer<typeof signup>;
export const validSignup: Signup = { name: "Ada", email: "ada@example.com" };
// @ts-expect-error name must be a string
export const badSignup: Signup = { name: 1, email: "" };
// @ts-expect-error email is required
export const missingEmail: Signup = { name: "Ada" };

// A synchronous validator returns its result directly, so it can be read without `await`.
export const syncResult = signup({});
export const isOk: boolean = syncResult.ok;
if (syncResult.ok) {
  const name: string = syncResult.value.name;
  void name;
} else {
  const messages: string[] = syncResult.error.issues.map((issue) => formatIssue(issue, englishMessages));
  void messages;
  void flatten(syncResult.error, englishMessages);
  // A failure is never empty, so its first issue needs no `!`, even with noUncheckedIndexedAccess.
  const first: string = formatIssue(syncResult.error.issues[0], englishMessages);
  void first;
}

// An asynchronous rule makes everything that holds it asynchronous, and the type says so.
export const username = refine(string(), async (name) => name !== "admin", { code: "username_taken" });
export const asyncSignup = object({ username, email: email() });
export const asyncResult: Promise<Awaited<ReturnType<typeof asyncSignup>>> = Promise.resolve(asyncSignup({}));
// @ts-expect-error an asynchronous validator's result cannot be read as if it were synchronous
export const notSync: Validator<unknown> = asyncSignup;
export const stillAsync: AsyncValidator<{ username: string; email: string }> = asyncSignup;

// Guards accept only synchronous validators.
export const raw: unknown = "text";
export const narrowed: string = is(string(), raw) ? raw : "";
// @ts-expect-error a validator that may finish later cannot be used as a synchronous guard
export const badGuard = is(username, raw);

// Anything shaped like `(input: unknown) => result` is a validator, so custom ones need no helper.
export const even: Validator<number> = (input) =>
  typeof input === "number" && input % 2 === 0 ? pass(input) : fail({ code: "not_even" });
export const evens = object({ count: even });
export const evenCount: number | undefined = (() => {
  const result = evens({ count: 2 });
  return result.ok ? result.value.count : undefined;
})();

// Literals and lists of values keep their exact types.
export const role = oneOf(["admin", "user"]);
export const roleValue: Infer<typeof role> = "admin";
// @ts-expect-error "guest" is not in the list
export const badRole: Infer<typeof role> = "guest";
export const tag = literal("v1");
export const tagValue: Infer<typeof tag> = "v1";
// @ts-expect-error only "v1" is accepted
export const badTag: Infer<typeof tag> = "v2";
export const nothing = literal(undefined);
export const nothingValue: Infer<typeof nothing> = undefined;

enum Status {
  Active = "active",
  Archived = "archived",
}
export const status = nativeEnum(Status);
export const statusValue: Infer<typeof status> = Status.Active;

// Formats produce strings; date and bigint produce their own types.
export const site: string | undefined = (() => {
  const result = url({ allowLocal: true })(raw);
  return result.ok ? result.value : undefined;
})();
export const stamp = datetime();
export const stampValue: Infer<typeof stamp> = "2026-09-28T14:30:00Z";
export const day = date({ min: new Date(0) });
export const dayValue: Infer<typeof day> = new Date();
export const big = bigint({ min: 0n });
export const bigValue: Infer<typeof big> = 1n;
// @ts-expect-error a bigint validator produces bigint, not number
export const badBig: Infer<typeof big> = 1;

// Collections keep their item types.
export const tags = array(string(), { max: 5, unique: true });
export const tagList: Infer<typeof tags> = ["a", "b"];
// @ts-expect-error items must be strings
export const badTagList: Infer<typeof tags> = [1];
// The callback of `unique` is typed by the item, with no annotation.
export const users = array(object({ id: number() }), { unique: (user) => user.id });
// @ts-expect-error the item has no `name`
export const badUsers = array(object({ id: number() }), { unique: (user) => user.name });
export const point = tuple([number(), number()]);
export const pointValue: Infer<typeof point> = [1, 2];
// @ts-expect-error a tuple has a fixed length
export const badPoint: Infer<typeof point> = [1, 2, 3];
export const call = tuple([string()], { rest: number() });
export const callValue: Infer<typeof call> = ["sum", 1, 2, 3];
export const scores = record(string(), number());
export const scoreValue: Infer<typeof scores> = { ada: 1 };
export const perDay = record(oneOf(["mon", "tue"]), number());
export const perDayValue: Infer<typeof perDay> = { mon: 1 };
export const stock = map(string(), number());
export const stockValue: Infer<typeof stock> = new Map([["apples", 1]]);
export const ids = set(number());
export const idsValue: Infer<typeof ids> = new Set([1]);

// Wrappers change the output type, and object properties follow.
export const settings = object({
  role: withDefault(oneOf(["admin", "user"]), "user"),
  nickname: nullable(string()),
  page: fallback(number(), 1),
  note: optional(string()),
});
export const settingsValue: Infer<typeof settings> = { role: "admin", nickname: null, page: 2 };
// @ts-expect-error role is always present in the output, because it has a default
export const missingRole: Infer<typeof settings> = { nickname: null, page: 2 };
export const length = transform(string(), (text) => text.length);
export const lengthValue: Infer<typeof length> = 3;
export const loaded = transform(string(), async (id) => ({ id }));
// @ts-expect-error a transform that returns a promise is asynchronous
export const notSyncLoaded: Validator<{ id: string }> = loaded;
declare const sometimesLater: (id: string) => number | Promise<number>;
export const maybeLoaded = transform(string(), sometimesLater);
export const maybeLoadedValue: Infer<typeof maybeLoaded> = 1;
// @ts-expect-error the value is what the promise settles to
export const maybeLoadedPromise: Infer<typeof maybeLoaded> = Promise.resolve(1);
// @ts-expect-error a transform that may return a promise must be awaited
export const maybeLoadedOk = maybeLoaded("a").ok;
export const updates = object(partial({ name: string(), email: email() }));
export const updateValue: Infer<typeof updates> = {};

// Unions produce unions, and a tagged union narrows on its tag.
export const idOrName = union([number({ int: true }), string()]);
export const idOrNameValue: Infer<typeof idOrName> = "a";
// @ts-expect-error booleans are not in the union
export const badIdOrName: Infer<typeof idOrName> = true;
export const event = discriminatedUnion("type", {
  click: object({ x: number(), y: number() }),
  key: object({ key: string() }),
});
export const eventValue: Infer<typeof event> = { type: "key", key: "a" };
// @ts-expect-error "scroll" is not a variant
export const badEvent: Infer<typeof event> = { type: "scroll" };
export const clickX: number | undefined = (() => {
  const result = event(raw);
  return result.ok && result.value.type === "click" ? result.value.x : undefined;
})();
export const both = intersection(object({ name: string() }), object({ age: number() }));
export const bothValue: Infer<typeof both> = { name: "Ada", age: 36 };
export const settingsFromText = json(object({ theme: oneOf(["light", "dark"]) }));
export const settingsFromTextValue: Infer<typeof settingsFromText> = { theme: "dark" };

// A recursive validator names its own type.
interface Category {
  name: string;
  children: Category[];
}
export const category: Validator<Category> = object({
  name: string(),
  children: array(lazy(() => category, { maxDepth: 64 })),
});

// Coercing validators produce the strict validator's type, and take its options.
export const port = coerceNumber({ int: true, min: 1, max: 65535 });
export const portValue: Infer<typeof port> = 8080;
// @ts-expect-error a coerced number is a number, not text
export const badPortValue: Infer<typeof port> = "8080";
export const flag = coerceBoolean();
export const flagValue: Infer<typeof flag> = true;
export const label = coerceString({ trim: true });
export const labelValue: Infer<typeof label> = "a";
export const counter = coerceBigint({ min: 0n });
export const counterValue: Infer<typeof counter> = 1n;
export const when = coerceDate();
export const whenValue: Infer<typeof when> = new Date();
export const environment = object({ PORT: port, DEBUG: withDefault(flag, false) });
export const environmentValue: Infer<typeof environment> = { PORT: 1, DEBUG: false };

// A validator exposed as a Standard Schema keeps its call signature and its types.
export const exposed = standard(object({ email: email() }), englishMessages);
export const exposedResult = exposed({ email: "a@example.com" });
export const asStandard: StandardSchemaV1<unknown, { email: string }> = exposed;
export const standardOutput: StandardSchemaV1.InferOutput<typeof exposed> = { email: "a@example.com" };
// @ts-expect-error the output type is the validator's output
export const badStandardOutput: StandardSchemaV1.InferOutput<typeof exposed> = { email: 1 };
