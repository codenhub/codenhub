import { requirePublicJsdocRule } from "./rules/require-public-jsdoc.js";

/**
 * ESLint plugin for requiring JSDoc on public declarations.
 */
const plugin = {
  rules: {
    "require-public-jsdoc": requirePublicJsdocRule,
  },
};

/**
 * Default export of the eslint-plugin-require-jsdoc plugin.
 */
export default plugin;
/**
 * ESLint rule to enforce JSDoc comments for exported public declarations in entry points.
 */
export { requirePublicJsdocRule };
