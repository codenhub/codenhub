import type { BubbleContext, BubbleElementInstance } from "bubble-plugin";

/**
 * Runs when the element is first initialized in the DOM.
 */
export function initialize(instance: BubbleElementInstance, context: BubbleContext): void {
  const container = instance.canvas[0];
  const mainDiv = document.createElement("div");
  mainDiv.style.width = "100%";
  mainDiv.style.height = "100%";
  mainDiv.style.display = "flex";
  mainDiv.style.alignItems = "center";
  mainDiv.style.justifyContent = "center";
  mainDiv.innerText = "Initializing...";

  container.appendChild(mainDiv);
  instance.data.mainDiv = mainDiv;

  // Using context to avoid unused parameter warning
  if (context.timezone) {
    console.log("Timezone initialized:", context.timezone);
  }
}
