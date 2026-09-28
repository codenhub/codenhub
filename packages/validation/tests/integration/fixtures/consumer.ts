/*
 * Compiled against the built declarations by consumer-types.test.ts, the way an app installing the
 * package sees it. Every `@ts-expect-error` line must fail to compile, and everything else must not.
 */
import { val, type Infer, type Validator } from "../../../dist/index";

export const userSchema = val.object({
  name: val.string().min(2),
  email: val.string().email(),
  role: val.enum(["admin", "user"]).default("user"),
  age: val.number().int().min(18).optional(),
});
export type User = Infer<typeof userSchema>;
export const user: User = { name: "Ada", email: "ada@example.com", role: "admin" };
// @ts-expect-error name must be a string
export const badUser: User = { name: 1, email: "", role: "user" };

export const eventSchema = val.discriminatedUnion("type", [
  val.object({ type: val.literal("click"), coordinates: val.tuple([val.number(), val.number()]) }),
  val.object({ type: val.literal("key"), key: val.string().min(1) }),
]);
export const event: Infer<typeof eventSchema> = { type: "key", key: "a" };
// @ts-expect-error "scroll" is not a variant
export const badEvent: Infer<typeof eventSchema> = { type: "scroll" };

export const id = val.union([val.string().uuid(), val.number().int()]);
export const idValue: Infer<typeof id> = 1;
// @ts-expect-error booleans are not in the union
export const badId: Infer<typeof id> = true;

export const port = val.coerce.number().int().min(1).max(65535);
export const flags = val.record(val.string(), val.coerce.boolean());

export const chained = val
  .string()
  .refine((text) => text !== "admin", "reserved")
  .check((text, ctx) => {
    if (text.length > 20) {
      ctx.addIssue({ code: "too_long", message: "too long" });
    }
  })
  .max(30);
export const extended = val
  .object({ a: val.string() })
  .refine(() => true)
  .extend({ b: val.number() });

interface Category {
  name: string;
  children: Category[];
}
export const category: Validator<Category> = val.lazy(() =>
  val.object({ name: val.string(), children: val.array(category) }),
);

export const merged = val.object({ a: val.string() }).and(val.object({ b: val.number() }));
export const either = val.string().or(val.number());
export const parsed: number = val
  .string()
  .transform((text) => text.length)
  .parse("abc");
// @ts-expect-error min takes a number
export const badMin = val.string().min("3");
