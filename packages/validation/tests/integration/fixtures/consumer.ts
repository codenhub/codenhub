/*
 * Compiled against the built declarations by consumer-types.test.ts, the way an app installing the
 * package sees it. Every `@ts-expect-error` line must fail to compile, and everything else must not.
 */
import {
  bigint,
  date,
  datetime,
  email,
  fail,
  flatten,
  formatIssue,
  is,
  literal,
  nativeEnum,
  number,
  object,
  oneOf,
  optional,
  pass,
  pipe,
  refine,
  string,
  url,
  type AsyncValidator,
  type Infer,
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
  const messages: string[] = syncResult.error.issues.map((issue) => formatIssue(issue));
  void messages;
  void flatten(syncResult.error);
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
