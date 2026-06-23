# Bubble Plugin Development Guide

This guide describes how to develop Bubble.io plugins using TypeScript and the `bubble-plugin` package.

## Client-Side Actions

Client-side actions run directly in the browser context of the Bubble app.

### File Structure

Place client actions under `src/actions/<action-name>.ts`.

### TypeScript Signature

```typescript
import { BubbleContext, BubbleProperties } from "bubble-plugin";

export interface MyActionProperties extends BubbleProperties {
  text_to_show: string;
  delay_ms?: number;
}

export function action(properties: MyActionProperties, context: BubbleContext): void {
  const message = properties.text_to_show;
  console.log("Action triggered:", message);
}
```

### Asynchronous Client Actions

If an action does asynchronous work, use standard browser APIs or async/await. Ensure you wrap things in try/catch to log errors cleanly.
Bubble client actions do not wait for a returned promise automatically. If you need to return values or wait, you must trigger an event to notify Bubble or set a state.

---

## Server-Side Actions

Server-side actions run in Bubble's Node.js environment. Depending on your configuration, they might run in a v1 or v2/v3 plugin engine.

### File Structure

Place server actions under `src/actions/<action-name>-server.ts`.

### TypeScript Signature

```typescript
import { BubbleContext, BubbleProperties } from "bubble-plugin";

interface MyServerProperties extends BubbleProperties {
  input_data: string;
}

interface MyServerResult {
  output_data: string;
}

export async function action(properties: MyServerProperties, context: BubbleContext): Promise<MyServerResult> {
  const input = properties.input_data;

  // Call external API or perform server logic
  const processed = input.toUpperCase();

  return {
    output_data: processed,
  };
}
```

---

## Custom Elements

Bubble elements are visual components with lifecycle methods.

### Structure

For each element, create a directory under `src/elements/<element-name>/`:

- `initialize.ts` - Runs when the element is inserted into the page. Setup DOM and listeners here.
- `update.ts` - Runs whenever properties change. Handle re-renders here.
- `preview.ts` - Runs inside the Bubble editor canvas to show a placeholder.

### Element Lifecycle Code

#### initialize.ts

```typescript
import { BubbleContext, BubbleElementInstance } from "bubble-plugin";

export function initialize(instance: BubbleElementInstance, context: BubbleContext): void {
  // Create HTML wrapper
  const container = instance.canvas[0];
  const mainDiv = document.createElement("div");
  mainDiv.id = `bubble-el-${instance.data.id || Math.random()}`;
  container.appendChild(mainDiv);

  // Store reference in instance data
  instance.data.mainDiv = mainDiv;
}
```

#### update.ts

```typescript
import { BubbleContext, BubbleElementInstance, BubbleProperties } from "bubble-plugin";

interface ElementProperties extends BubbleProperties {
  bg_color: string;
  label_text: string;
}

export function update(instance: BubbleElementInstance, properties: ElementProperties, context: BubbleContext): void {
  const mainDiv = instance.data.mainDiv as HTMLDivElement;
  if (!mainDiv) return;

  mainDiv.style.backgroundColor = properties.bg_color || "#ffffff";
  mainDiv.innerText = properties.label_text || "No Label";

  // Trigger event in Bubble (if defined in bubble.json)
  // instance.triggerEvent('clicked');
}
```
