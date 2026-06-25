import { maxParamsRule } from "./rules/max-params";

export const rules = {
  "max-params": maxParamsRule,
};

const plugin = {
  rules,
};

export default plugin;
export type * from "./rules/max-params";
