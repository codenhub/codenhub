import { generateInstanceId } from "./instance-id";
import { ModalController } from "./modal";
import { applyGlobalTokens, assertValidTokens, removeGlobalTokens } from "./tokens";
import type { Dialogs, DialogsConfig, DialogsRuntimeConfig } from "./types";

function copyConfig(config: DialogsConfig): DialogsConfig {
  return {
    ...config,
    labels: config.labels ? { ...config.labels } : undefined,
    tokens: config.tokens ? { ...config.tokens } : undefined,
  };
}

function validateConfig(config: DialogsConfig): void {
  assertValidTokens(
    config.tokens,
    config.container?.ownerDocument ?? (typeof document === "undefined" ? undefined : document),
  );
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
 * @throws {Error} If token colors are invalid.
 */
export function createDialogs(config: DialogsConfig = {}): Dialogs {
  const instanceId = generateInstanceId();
  validateConfig(config);
  let current = copyConfig(config);
  let controller: ModalController | null = null;
  let isDestroyed = false;

  // Resolved on every dialog, not once, so a page that replaces <body>
  // still gets its dialogs.
  const getParent = (): HTMLElement => {
    const parent = resolveParentElement(current);
    if (current.tokens) {
      applyGlobalTokens(current.tokens, instanceId, parent.ownerDocument, current.nonce);
    }
    return parent;
  };

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
      const merged = { ...current, ...runtimeConfig };
      validateConfig(merged);
      const next = copyConfig(merged);
      // Keyed on presence, not value: `tokens: undefined` clears them.
      if ("tokens" in runtimeConfig || "nonce" in runtimeConfig) {
        applyGlobalTokens(next.tokens, instanceId, resolveParentElement(next).ownerDocument, next.nonce);
      }
      current = next;
    },
    destroy: () => {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      controller?.destroy();
      controller = null;
      removeGlobalTokens(instanceId);
    },
  };
}

/**
 * Pre-configured default browser singleton for dialogs. Marked pure so a
 * bundler drops it when nothing uses it.
 */
export const dialog: Dialogs = /* @__PURE__ */ createDialogs();
