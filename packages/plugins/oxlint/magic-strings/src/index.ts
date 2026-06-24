import { noMagicStrings } from "./rules/no-magic-strings";

/**
 * ESLint plugin to detect and restrict magic strings.
 */
export const plugin = {
  rules: {
    "no-magic-strings": noMagicStrings,
  },
};

export { noMagicStrings };
export default plugin;
