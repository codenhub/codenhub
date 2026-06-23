/**
 * Dictionary of properties configured in the Bubble dashboard
 * and passed to actions or elements.
 */
export interface BubbleProperties {
  [key: string]: unknown;
}

/**
 * Context object provided by Bubble to actions and elements
 * containing environment variables, utility methods, and user details.
 */
export interface BubbleContext {
  /**
   * Object containing the API keys configured for the plugin.
   */
  keys: Record<string, string>;

  /**
   * Runs a server-side request (available in server-side actions).
   * @param options Request configuration options.
   * @returns The request response.
   */
  request?: (options: unknown) => unknown;

  /**
   * The current app user's timezone.
   */
  timezone?: string;

  /**
   * Utility for executing asynchronous callback-based functions synchronously
   * in Bubble server-side actions.
   * @param fn Function that takes a completion callback.
   * @returns The resolved value of type T.
   */
  async?: <T>(fn: (cb: (err: unknown, res: T) => void) => void) => T;
}

/**
 * Visual element instance state container.
 * Stores element data, jQuery/DOM container, and event/state triggers.
 */
export interface BubbleElementInstance {
  /**
   * jQuery selection containing the element's container DOM node.
   * Typings allow clean array indexing to retrieve the raw HTML element (e.g., instance.canvas[0]).
   */
  canvas: {
    [index: number]: HTMLElement;
    length: number;
  } & Record<string, unknown>;

  /**
   * Key-value store to persist state and references across lifecycles
   * (e.g. storing references to sub-elements or third-party libraries).
   */
  data: Record<string, unknown>;

  /**
   * Triggers a custom event defined in the plugin's bubble.json.
   * @param eventName The name of the event to trigger.
   */
  triggerEvent: (eventName: string) => void;

  /**
   * Publishes a value to a custom state defined on the element.
   * @param stateName The name of the custom state.
   * @param value The value to assign to the state.
   */
  publishState: (stateName: string, value: unknown) => void;
}
