import { requirePublicJsdocRule } from "./rules/require-public-jsdoc.js";

const plugin = {
  rules: {
    "require-public-jsdoc": requirePublicJsdocRule,
  },
};

export default plugin;
export { requirePublicJsdocRule };
