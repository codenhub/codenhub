import { noDeepPackageImports } from "./rules/no-deep-package-imports";

/**
 * ESLint plugin to enforce package import constraints.
 */
export const plugin = {
  rules: {
    "no-deep-package-imports": noDeepPackageImports,
  },
};

/**
 * ESLint rule to prevent deep internal imports across package boundaries.
 */
export { noDeepPackageImports };

/**
 * The default export of the ESLint plugin to enforce package import constraints.
 */
export default plugin;
