import { KEY_VALUES, type KeyboardKey } from "./keys";

export { KEYS } from "./keys";
export type { KeyboardKey } from "./keys";

/**
 * Modifier keys recognized in shortcut bindings.
 *
 * Matching is exact: every listed modifier must be active and no unlisted
 * modifier may be active at the time the event fires.
 */
export type ModifierKey = "ctrl" | "alt" | "shift" | "meta" | "mod" | "cmdOrCtrl";

/**
 * DOM keyboard event type to listen on.
 * @default "keydown"
 */
export type KeyboardEventName = "keydown" | "keyup";

/**
 * A key combined with one or more required modifier keys.
 *
 * The binding fires only when the key matches, every listed modifier is active,
 * and no unlisted modifier is active. An empty `modifiers` array is equivalent
 * to a plain string binding — no modifiers may be held.
 */
export interface KeyboardShortcut {
  key: KeyboardKey;
  modifiers: ModifierKey[];
}

/**
 * A key or key+modifier combination to listen for.
 *
 * - **String form** (`KeyboardKey`): fires when the key is pressed with no
 *   modifier keys active.
 * - **Object form** (`KeyboardShortcut`): fires when the key is pressed with
 *   exactly the listed modifiers active — no more, no less.
 *
 * Single-character keys (letters, digits, symbols) are matched
 * case-insensitively: `"K"` and `"k"` both match {@link KEYS.k}. Multi-
 * character keys such as `"Escape"` or `"F1"` must match exactly as reported
 * by the browser.
 */
export type KeyboardBinding = KeyboardKey | KeyboardShortcut;

/**
 * Options for {@link Keyboard.register}.
 */
export interface KeyboardSubscriptionOptions {
  /**
   * The event target to attach the listener to.
   * @default document
   */
  target?: EventTarget;
  /**
   * The DOM keyboard event to listen for.
   * @default "keydown"
   */
  event?: KeyboardEventName;
  /**
   * When `true`, calls {@link Event.stopImmediatePropagation} after the handler
   * runs, then stops iterating remaining subscriptions in this scope.
   *
   * This is stronger than {@link Event.stopPropagation}: it prevents sibling
   * listeners registered outside this {@link Keyboard} instance from receiving
   * the event, not only parent-element bubbling. Propagation is stopped even
   * when the handler throws.
   *
   * @default false
   */
  stopPropagation?: boolean;
  /**
   * When `true`, ignores keyboard events originating from inputs, textareas,
   * select dropdowns, or contenteditable elements. When a modifier key
   * (ctrl/alt/meta/mod) is held, the event will bypass the ignore and trigger.
   *
   * @default true
   */
  ignoreInput?: boolean;
}

/**
 * A handler called when a registered binding matches a keyboard event.
 *
 * The handler receives the original DOM {@link KeyboardEvent} and has full
 * control over it — call {@link Event.preventDefault} or
 * {@link Event.stopPropagation} directly as needed.
 */
export type KeyboardHandler = (event: KeyboardEvent) => void;

/**
 * Handle returned by {@link Keyboard.register} to manage a single binding.
 *
 * All methods are safe to call multiple times or after {@link unregister}.
 */
export interface KeyboardRegistration {
  /**
   * Removes this binding permanently. When the last subscription on a
   * target+event scope is unregistered, the underlying DOM listener is also
   * removed.
   */
  unregister(): void;
  /**
   * Re-enables this binding after a call to {@link disable}. No-op if already
   * enabled. Does not affect the instance-level enabled state set by
   * {@link Keyboard.enable}/{@link Keyboard.disable}.
   */
  enable(): void;
  /**
   * Silences this binding without removing it — the handler will not be called
   * until {@link enable} is called. Does not affect other bindings or the
   * instance-level enabled state.
   */
  disable(): void;
}

/**
 * Options configuration for creating a {@link Keyboard} instance.
 */
export interface KeyboardOptions {
  /**
   * Optional error handler to capture exceptions thrown in registered handlers
   * or during execution.
   */
  onError?: (error: unknown, fallback: string) => void;
}

type ResolvedOptions = {
  stopPropagation: boolean;
  ignoreInput: boolean;
};

interface SimpleKeySubscription {
  readonly kind: "simple";
  readonly binding: KeyboardKey;
  readonly handler: KeyboardHandler;
  readonly options: ResolvedOptions;
  enabled: boolean;
}

interface ShortcutSubscription {
  readonly kind: "shortcut";
  readonly binding: KeyboardShortcut;
  /** Pre-built from `binding.modifiers` for O(1) per-modifier lookup. */
  readonly modifierSet: Set<ModifierKey>;
  readonly handler: KeyboardHandler;
  readonly options: ResolvedOptions;
  enabled: boolean;
}

type KeyboardSubscription = SimpleKeySubscription | ShortcutSubscription;

interface KeyboardScope {
  event: KeyboardEventName;
  listener: EventListener;
  subscriptions: Set<KeyboardSubscription>;
  target: EventTarget;
}

const KEY_SET = new Set<string>(KEY_VALUES);
const ALL_MODIFIERS: readonly ModifierKey[] = ["ctrl", "alt", "shift", "meta"];
const DEFAULT_EVENT: KeyboardEventName = "keydown";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function isInputElement(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

/**
 * Manages keyboard bindings on one or more event targets.
 *
 * One DOM listener is shared per unique target+event combination (a "scope").
 * That listener is added when the first binding for the scope is registered and
 * removed automatically when the last binding is unregistered or when
 * {@link clear} is called.
 *
 * Use the module-level {@link keyboard} singleton for page-wide UI shortcuts.
 * Create a separate instance when you need isolated enable/disable control —
 * for example, a modal that must not interfere with page-level bindings.
 */
export class Keyboard {
  private scopes = new Set<KeyboardScope>();
  private enabled = true;
  private onError?: (error: unknown, fallback: string) => void;

  constructor(options?: KeyboardOptions) {
    this.onError = options?.onError;
  }

  /**
   * Registers a keyboard binding and returns a handle to manage it.
   *
   * If no `target` is provided and `document` is unavailable (e.g. SSR or a
   * Web Worker), registration fails silently: any registered `onError` handler
   * is called and a no-op {@link KeyboardRegistration} is returned.
   *
   * @param binding - The key or key+modifier combination to listen for.
   * @param handler - Called when the binding matches. Exceptions are caught and
   *   reported silently via `onError` callback if provided.
   * @param options - Target, event type, and propagation controls.
   */
  register(
    binding: KeyboardBinding,
    handler: KeyboardHandler,
    options: KeyboardSubscriptionOptions = {},
  ): KeyboardRegistration {
    const bindingKey = typeof binding === "string" ? binding : binding.key;
    if (!KEY_SET.has(bindingKey)) {
      this.onError?.(
        new Error(`[Keyboard] Invalid key value: "${bindingKey}". Key must be a value defined in KEYS.`),
        "Keyboard binding could not be registered.",
      );
      return { unregister: () => {}, enable: () => {}, disable: () => {} };
    }

    const target = options.target ?? this.getDefaultTarget();

    if (target === undefined) {
      this.onError?.(
        new Error("[Keyboard] Cannot register a keyboard binding without an event target."),
        "Keyboard binding could not be registered.",
      );
      return { unregister: () => {}, enable: () => {}, disable: () => {} };
    }

    const event = options.event ?? DEFAULT_EVENT;
    const scope = this.getOrCreateScope(target, event);
    const resolvedOptions: ResolvedOptions = {
      stopPropagation: options.stopPropagation ?? false,
      ignoreInput: options.ignoreInput ?? true,
    };

    const subscription: KeyboardSubscription =
      typeof binding === "string"
        ? { kind: "simple", binding, handler, options: resolvedOptions, enabled: true }
        : {
            kind: "shortcut",
            binding,
            modifierSet: new Set(
              binding.modifiers.map((mod) => (mod === "mod" || mod === "cmdOrCtrl" ? (isMac ? "meta" : "ctrl") : mod)),
            ),
            handler,
            options: resolvedOptions,
            enabled: true,
          };

    scope.subscriptions.add(subscription);

    return {
      unregister: () => this.unregister(scope, subscription),
      enable: () => {
        subscription.enabled = true;
      },
      disable: () => {
        subscription.enabled = false;
      },
    };
  }

  /**
   * Configures a custom error handler to intercept exceptions from keyboard handlers
   * or registration failures.
   */
  setErrorHandler(handler: (error: unknown, fallback: string) => void): void {
    this.onError = handler;
  }

  private matches(event: KeyboardEvent, subscription: KeyboardSubscription): boolean {
    const key = this.normalizeKey(event.key);

    if (subscription.kind === "simple") {
      if (key !== subscription.binding) {
        return false;
      }
      return ALL_MODIFIERS.every((mod) => {
        if (mod === "shift") {
          const isNonLetterSymbolOrDigit = event.key.length === 1 && !/^[a-zA-Z]$/.test(event.key);
          if (isNonLetterSymbolOrDigit) {
            return true;
          }
        }
        return !this.getModifierState(event, mod);
      });
    }

    if (key !== subscription.binding.key) {
      return false;
    }

    return ALL_MODIFIERS.every((mod) => {
      const required = subscription.modifierSet.has(mod);
      if (mod === "shift" && !required) {
        const isNonLetterSymbolOrDigit = event.key.length === 1 && !/^[a-zA-Z]$/.test(event.key);
        if (isNonLetterSymbolOrDigit) {
          return true;
        }
      }
      return required === this.getModifierState(event, mod);
    });
  }

  /**
   * Pauses all bindings on this instance without removing them. Useful for
   * temporarily suppressing all keyboard handling (e.g. while a blocking UI
   * overlay is open).
   *
   * Subscriptions silenced via {@link KeyboardRegistration.disable} are
   * independent and unaffected by this call.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Lifts the instance-level pause set by {@link disable}. No-op if already
   * enabled.
   *
   * Subscriptions silenced via {@link KeyboardRegistration.disable} are
   * independent and remain silenced until their own `enable` is called.
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Removes all bindings and their DOM listeners, then resets the instance-
   * level enabled state to `true`. Useful for cleanup on page teardown or in
   * tests.
   */
  clear(): void {
    this.scopes.forEach((scope) => {
      scope.target.removeEventListener(scope.event, scope.listener);
      scope.subscriptions.clear();
    });
    this.scopes.clear();
    this.enabled = true;
  }

  private handleEvent(scope: KeyboardScope, event: Event): void {
    if (!(event instanceof KeyboardEvent) || !this.enabled) {
      return;
    }

    const isInput = isInputElement(event.target);

    for (const subscription of scope.subscriptions) {
      if (!subscription.enabled) {
        continue;
      }

      if (isInput && subscription.options.ignoreInput) {
        const hasBypassModifier = event.ctrlKey || event.altKey || event.metaKey;
        if (!hasBypassModifier) {
          continue;
        }
      }

      if (!this.matches(event, subscription)) {
        continue;
      }

      try {
        subscription.handler(event);
      } catch (error) {
        this.onError?.(error, "Keyboard handler failed.");
      }

      if (subscription.options.stopPropagation) {
        event.stopImmediatePropagation();
        break;
      }
    }
  }

  private unregister(scope: KeyboardScope, subscription: KeyboardSubscription): void {
    scope.subscriptions.delete(subscription);

    if (scope.subscriptions.size > 0) {
      return;
    }

    scope.target.removeEventListener(scope.event, scope.listener);
    this.scopes.delete(scope);
  }

  private getOrCreateScope(target: EventTarget, event: KeyboardEventName): KeyboardScope {
    const existingScope = this.findScope(target, event);

    if (existingScope !== undefined) {
      return existingScope;
    }

    const scope: KeyboardScope = {
      event,
      listener: (event) => {
        this.handleEvent(scope, event);
      },
      subscriptions: new Set<KeyboardSubscription>(),
      target,
    };

    target.addEventListener(event, scope.listener);
    this.scopes.add(scope);

    return scope;
  }

  private findScope(target: EventTarget, event: KeyboardEventName): KeyboardScope | undefined {
    for (const scope of this.scopes) {
      if (scope.target === target && scope.event === event) {
        return scope;
      }
    }
    return undefined;
  }

  private normalizeKey(value: string): KeyboardKey | undefined {
    const normalizedValue = value.length === 1 ? value.toLowerCase() : value;

    if (!KEY_SET.has(normalizedValue)) {
      return undefined;
    }

    return normalizedValue as KeyboardKey;
  }

  private getModifierState(event: KeyboardEvent, mod: ModifierKey): boolean {
    if (mod === "ctrl") {
      return event.ctrlKey;
    }
    if (mod === "alt") {
      return event.altKey;
    }
    if (mod === "shift") {
      return event.shiftKey;
    }
    return event.metaKey;
  }

  private getDefaultTarget(): EventTarget | undefined {
    if (typeof document === "undefined") {
      return undefined;
    }

    return document;
  }
}

/** Shared page-level keyboard instance used by app UI modules. */
export const keyboard = new Keyboard();
