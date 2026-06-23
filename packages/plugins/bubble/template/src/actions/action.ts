import type { BubbleContext, BubbleProperties } from "bubble-plugin";

export interface ActionProperties extends BubbleProperties {
  my_param: string;
}

/**
 * Example Bubble action.
 * Compiles to dist/actions/action.js for pasting into the Bubble editor.
 */
export function action(properties: ActionProperties, context: BubbleContext): void {
  const param = properties.my_param;
  console.log("Action executed with param:", param, "keys:", Object.keys(context.keys || {}));
}
