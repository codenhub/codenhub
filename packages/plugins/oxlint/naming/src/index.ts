import arrayPlural from "./rules/array-plural";
import booleanPrefix from "./rules/boolean-prefix";

/**
 * The naming rules provided by the naming plugin.
 */
export const rules = {
  "boolean-prefix": booleanPrefix,
  "array-plural": arrayPlural,
};

/**
 * The configurations provided by the naming plugin.
 */
export const configs = {
  recommended: {
    plugins: ["@codenhub/naming"],
    rules: {
      "@codenhub/naming/boolean-prefix": "error",
      "@codenhub/naming/array-plural": "warn",
    },
  },
};

/**
 * Default export of the ESLint naming plugin.
 */
const plugin = {
  rules,
  configs,
};

/**
 * The default export of the ESLint naming plugin.
 */
export default plugin;
