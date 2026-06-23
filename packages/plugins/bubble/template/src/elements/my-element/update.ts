import type { BubbleContext, BubbleElementInstance, BubbleProperties } from "bubble-plugin";

export interface MyElementProperties extends BubbleProperties {
  bg_color: string;
}

/**
 * Runs whenever element properties change or re-renders are triggered.
 */
export function update(instance: BubbleElementInstance, properties: MyElementProperties, context: BubbleContext): void {
  const mainDiv = instance.data.mainDiv as HTMLDivElement;
  if (!mainDiv) {
    return;
  }

  mainDiv.style.backgroundColor = properties.bg_color || "#ffffff";
  mainDiv.innerText = "Template Element Loaded";

  // Using context to avoid unused parameter warning
  if (context.timezone) {
    console.log("Update timezone context:", context.timezone);
  }
}
