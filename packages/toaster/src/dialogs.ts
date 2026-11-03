import { generateInstanceId } from "./instance-id";
import { ModalController } from "./modal";
import type { Dialogs, DialogsConfig, DialogsRuntimeConfig } from "./types";

function copyConfig(config: DialogsConfig): DialogsConfig {
  return {
    ...config,
    labels: config.labels ? { ...config.labels } : undefined,
  };
}

function resolveParentElement(config: DialogsConfig): HTMLElement {
  if (config.container) {
    return config.container;
  }
  if (typeof document !== "undefined") {
    return document.body ?? document.documentElement;
  }
  throw new Error("DOM document is not available. Dialogs require a browser environment.");
}

/**
 * Creates a new independent dialogs instance.
 *
 * Each call returns a fresh instance whose dialogs open one at a time.
 * Consumers who want a singleton can use the default `dialog` export.
 *
 * While one of its dialogs is open, the toasts of every toaster rendering into
 * the same parent element move inside it, so they stay visible, clickable, and
 * announced above the backdrop.
 *
 * @param config Optional initial configuration.
 * @returns An independent dialogs instance.
 */
export function createDialogs(config: DialogsConfig = {}): Dialogs {
  const instanceId = generateInstanceId();
  let current = copyConfig(config);
  let controller: ModalController | null = null;
  let isDestroyed = false;

  // Resolved on every dialog, not once, so a page that replaces <body>
  // still gets its dialogs.
  const getParent = (): HTMLElement => resolveParentElement(current);

  const getController = (): ModalController => {
    if (isDestroyed) {
      throw new Error("This dialogs instance has been destroyed. Create a new one with createDialogs().");
    }
    controller ??= new ModalController(
      getParent,
      instanceId,
      () => current.className,
      () => current.labels ?? {},
    );
    return controller;
  };

  return {
    confirm: (message, options) => getController().confirm(message, options),
    prompt: (message, options) => getController().prompt(message, options),
    alert: (message, options) => getController().alert(message, options),
    configure: (runtimeConfig: DialogsRuntimeConfig) => {
      if (isDestroyed) {
        throw new Error("This dialogs instance has been destroyed. Create a new one with createDialogs().");
      }
      if ("container" in runtimeConfig) {
        throw new Error("Dialogs container cannot be changed after construction.");
      }
      current = copyConfig({ ...current, ...runtimeConfig });
    },
    destroy: () => {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      controller?.destroy();
      controller = null;
    },
  };
}

/**
 * Pre-configured default browser singleton for dialogs. Marked pure so a
 * bundler drops it when nothing uses it.
 */
export const dialog: Dialogs = /* @__PURE__ */ createDialogs();
