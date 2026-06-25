import { maxParamsRule } from "./rules/max-params";

/**
 * The ESLint rules provided by the max-params plugin.
 */
export const rules = {
  "max-params": maxParamsRule,
};

/**
 * The ESLint plugin instance for max-params.
 */
const plugin = {
  rules,
};

/**
 * Default export of the ESLint plugin to enforce a maximum number of function parameters.
 */
export default plugin;
export type * from "./rules/max-params";
