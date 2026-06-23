import type { BubbleContext, BubbleElementInstance, BubbleProperties } from "bubble-plugin";

export interface MyElementPreviewProperties extends BubbleProperties {
  bg_color: string;
}

/**
 * Runs within the Bubble editor canvas to render a preview of the element.
 */
export function preview(
  instance: BubbleElementInstance,
  properties: MyElementPreviewProperties,
  context: BubbleContext,
): void {
  const container = instance.canvas[0];
  container.style.backgroundColor = properties.bg_color || "#cccccc";
  container.innerText = "Preview: My Element";

  // Using context to avoid unused parameter warning
  if (context.timezone) {
    console.log("Preview context timezone:", context.timezone);
  }
}
