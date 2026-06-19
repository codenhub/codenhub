import { err } from "@codenhub/error";
import { feedback } from "../feedback";
import { KEY_VALUES, type KeyboardKey } from "./keys";

export { KEYS } from "./keys";
export type { KeyboardKey } from "./keys";

/**
 * Modifier keys recognized in shortcut bindings.
 *
 * Matching is exact: every listed modifier must be active and no unlisted
 * modifier may be active at the time the event fires.
 */
export type ModifierKey = "ctrl" | "alt" | "shift" | "meta";

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
}

/**
 * A handler called when a registered binding matches a keyboard event.
 *
 * The handler receives the original DOM {@link KeyboardEvent} and has full
 * control over it — call {@link Event.preventDefault} or
 * {@link Event.stopPropagation} directly as needed.
 *
 * Exceptions thrown by the handler are caught and reported via `feedback`
 * rather than propagating to the browser event loop.
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

type ResolvedOptions = {
  stopPropagation: boolean;
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

  /**
   * Registers a keyboard binding and returns a handle to manage it.
   *
   * If no `target` is provided and `document` is unavailable (e.g. SSR or a
   * Web Worker), registration fails silently: `feedback` is called and
   * a no-op {@link KeyboardRegistration} is returned.
   *
   * @param binding - The key or key+modifier combination to listen for.
   * @param handler - Called when the binding matches. Exceptions are caught and
   *   reported silently — they do not propagate.
   * @param options - Target, event type, and propagation controls.
   */
  register(
    binding: KeyboardBinding,
    handler: KeyboardHandler,
    options: KeyboardSubscriptionOptions = {},
  ): KeyboardRegistration {
    const target = options.target ?? this.getDefaultTarget();

    if (target === undefined) {
      feedback.register(err(new Error("[Keyboard] Cannot register a keyboard binding without an event target.")), {
        fallback: "Keyboard binding could not be registered.",
        toast: false,
      });
      return { unregister: () => {}, enable: () => {}, disable: () => {} };
    }

    const event = options.event ?? DEFAULT_EVENT;
    const scope = this.getOrCreateScope(target, event);
    const resolvedOptions: ResolvedOptions = {
      stopPropagation: options.stopPropagation ?? false,
    };

    const subscription: KeyboardSubscription =
      typeof binding === "string"
        ? { kind: "simple", binding, handler, options: resolvedOptions, enabled: true }
        : {
            kind: "shortcut",
            binding,
            modifierSet: new Set(binding.modifiers),
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

  private matches(event: KeyboardEvent, subscription: KeyboardSubscription): boolean {
    const key = this.normalizeKey(event.key);

    if (subscription.kind === "simple") {
      return key === subscription.binding && ALL_MODIFIERS.every((mod) => !this.getModifierState(event, mod));
    }

    if (key !== subscription.binding.key) {
      return false;
    }

    return ALL_MODIFIERS.every((mod) => subscription.modifierSet.has(mod) === this.getModifierState(event, mod));
  }

  /**
   * Pauses all bindings on this instance without removing them. Useful for
   * temporarily suppressing all keyboard handling (e.g. while a blocking UI
   * overlay is open).
   *
   * Individual bindings silenced via {@link KeyboardRegistration.disable} are
   * independent and unaffected by this call.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Lifts the instance-level pause set by {@link disable}. No-op if already
   * enabled.
   *
   * Individual bindings silenced via {@link KeyboardRegistration.disable} are
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

    for (const subscription of scope.subscriptions) {
      if (!subscription.enabled || !this.matches(event, subscription)) {
        continue;
      }

      try {
        subscription.handler(event);
      } catch (error) {
        feedback.register(err(error), {
          fallback: "Keyboard handler failed.",
          toast: false,
        });
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
