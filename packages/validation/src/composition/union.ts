import { runOf, toolsOf } from "../core/child";
import { accepter, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { assertList, nested } from "../core/result";
import { count, cut, FAIL, report, straighten, type Draft, type Run } from "../core/run";
import { split } from "../core/split";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
} from "../core/types";
import { wordUnion } from "../core/words";

/**
 * Creates a validator that accepts a value passing any one of several validators.
 *
 * @remarks
 * The validators are tried in order and the first that accepts the value wins, so put the more
 * specific ones first, and the value it produced is the result. If none accepts it, the result is
 * one `invalid_union` issue at the value's own location whose `params.issues` lists, per option in
 * order, the issues that option found; their paths are relative to the value the union received. An
 * issue an option found that carries issues of its own, such as another union's, is held without them
 * when one of those carries more, so the result of a recursive union stays as small as its input; a limit
 * of `lazy` found behind it stands in its place. For objects that share a tag property, `tagged` reports the failing variant's own
 * issues instead. It is synchronous when every option is, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const id = union([string({ min: 1 }), number({ int: true })]);
 * id("a1"); // { ok: true, value: "a1" }
 * id(7); // { ok: true, value: 7 }
 * id(true); // { ok: false, ... }, code "invalid_union"
 * ```
 *
 * @typeParam TOptions - The validators to try, at least one.
 * @param options - The validators to try, in order.
 * @returns A validator that produces what the first accepting option produces.
 * @throws {TypeError} When `options` is not a list, is empty, or holds an option that is not a function.
 */
export function union<const TOptions extends readonly [AnyValidator, ...AnyValidator[]]>(
  options: TOptions,
  ...rest: Rest<Infer<TOptions[number]>, MessageOptions>
): Composed<TOptions[number], Infer<TOptions[number]>, InferInput<TOptions[number]>>;
export function union<const TOptions extends readonly [AnyValidator, ...AnyValidator[]]>(
  options: TOptions,
  ...rest: AsyncRest<Infer<TOptions[number]>, MessageOptions>
): AsyncSchema<Infer<TOptions[number]>, InferInput<TOptions[number]>>;
export function union(options: readonly AnyValidator[], ...rest: unknown[]): AnyValidator {
  assertList("options", options);
  // Copied, so changing the list after the validator is made changes nothing.
  const tried = [...options];
  if (tried.length === 0) {
    // The types forbid it, but a union of nothing would reject every value without saying why.
    throw new TypeError("union() needs at least one option");
  }
  const runs = tried.map((option, index) => runOf(option, `options[${index}]`));
  const [settings, checks] = split<MessageOptions, unknown>(rest);
  const { message } = settings;
  const accept = accepter(checks, message);
  const tools = toolsOf(runs, waitsOf(checks));
  // Tried in a loop while the values are ready, and not by one call inside another: every option that
  // failed would stay on the stack while the next ran, so a recursive union of twenty options overflowed
  // it inside the default depth of `lazy`. What an option found is taken out of the validation as it
  // fails, relative to the value, as `params.issues` holds it. `from` is where the issues of this union
  // begin, and `found` what each option before `start` reported.
  const attempt = (input: unknown, start: number, from: number, before?: (Draft[] | undefined)[]): unknown => {
    // Made by the first option that fails: the first one passes most values.
    let found = before;
    for (let index = start; index < runs.length; index += 1) {
      const value = (runs[index] as Run)(input);
      if (tools !== undefined && tools.is(value)) {
        return tools.after(from, value, (later, begin) => {
          if (later !== FAIL) {
            return accept(later);
          }
          const lists = (found ??= []);
          lists.push(cut(begin));
          return attempt(input, index + 1, begin, lists);
        });
      }
      if (value !== FAIL) {
        return accept(value);
      }
      const list = cut(from);
      if (found === undefined) {
        found = [list];
      } else {
        found.push(list);
      }
    }
    // Written out only now, since an option that passes leaves nothing to say about the ones before it.
    return report(
      "invalid_union",
      { issues: (found ?? []).map((list) => straighten(list ?? []).map(nested)) },
      message,
    );
  };
  const run: Run = (input) => attempt(input, 0, count());
  run.w = tools;
  // What an option found is held behind the issue of the union, so only that issue is worded.
  return toValidator(run, { kind: "union", options: settings, checks, members: Object.freeze(tried) }, [wordUnion]);
}
