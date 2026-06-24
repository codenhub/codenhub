import { noDeepPackageImports } from "./rules/no-deep-package-imports";

/**
 * ESLint plugin to enforce package import constraints.
 */
export const plugin = {
  rules: {
    "no-deep-package-imports": noDeepPackageImports,
  },
};

export { noDeepPackageImports };
export default plugin;
