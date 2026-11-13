/** Longest unknown option name quoted in a message; a longer one is cut and ends in `...`. */
const MAX_NAME_LENGTH = 64;

/**
 * Throws when `options` has an own enumerable string key that is not in `known`, so a misspelled option
 * such as `audiance` fails when the function is called instead of silently turning a check off. A member
 * whose value is `undefined` still counts, and symbol keys are ignored.
 *
 * @param known - Every documented option, as the keys of a record typed by the options interface.
 * @throws TypeError naming the first unknown member. The name is the caller's own, not token input.
 */
export function rejectUnknownOptions(
  options: object,
  known: Readonly<Record<string, true>>,
  functionName: string,
): void {
  for (const name of Object.keys(options)) {
    if (!Object.hasOwn(known, name)) {
      const shown = name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH)}...` : name;
      throw new TypeError(`${functionName}: options.${shown} is not an option.`);
    }
  }
}
