/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Dictionary of properties configured in the Bubble dashboard
 * and passed to actions or elements.
 */
export interface BubbleProperties {
  [key: string]: any;
}

/**
 * Context object provided by Bubble to actions and elements
 * containing environment variables, utility methods, and user details.
 */
export interface BubbleContext {
  /**
   * Object containing the API keys configured for the plugin.
   */
  keys: {
    [key: string]: string;
  };

  /**
   * Runs a server-side request (available in server-side actions).
   */
  request?: (options: any) => any;

  /**
   * The current app user's timezone.
   */
  timezone?: string;

  /**
   * Information about the current running environment.
   */
  async?: <T>(fn: (cb: (err: any, res: T) => void) => void) => T;
}

/**
 * Visual element instance state container.
 * Stores element data, jQuery/DOM container, and event/state triggers.
 */
export interface BubbleElementInstance {
  /**
   * jQuery selection containing the element's container DOM node.
   * Typically index 0 is the raw HTML element: instance.canvas[0]
   */
  canvas: any;

  /**
   * Key-value store to persist state and references across lifecycles
   * (e.g. storing references to sub-elements or third-party libraries).
   */
  data: {
    [key: string]: any;
  };

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
  publishState: (stateName: string, value: any) => void;
}
