import { noMagicStrings } from "./rules/no-magic-strings";

/**
 * ESLint plugin to detect and restrict magic strings.
 */
export const plugin = {
  rules: {
    "no-magic-strings": noMagicStrings,
  },
};

/**
 * ESLint rule that disallows magic strings inside functions.
 */
export { noMagicStrings };

/**
 * Default export of the ESLint plugin to detect and restrict magic strings.
 */
export default plugin;
