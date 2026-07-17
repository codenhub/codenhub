import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { ComponentDefinition, ComponentEvents, ComponentProperties, ComponentProps } from "../core/types.js";
import { ChButton as ChButtonDefinition } from "./button.js";

/**
 * Creates a React component wrapper around a custom element definition.
 *
 * Declared properties are assigned to the element, declared events map to
 * case-insensitive `on<Event>` props, and the forwarded ref exposes the host
 * `HTMLElement`. The custom element must be registered separately.
 *
 * @param definition - Native component definition to wrap.
 * @returns A React component that renders the definition's custom element.
 */
export function createReactWrapper<Props extends ComponentProperties, Methods, Events extends ComponentEvents>(
  definition: ComponentDefinition<Props, Methods, Events>,
): React.ForwardRefExoticComponent<
  React.RefAttributes<HTMLElement> & Partial<ComponentProps<Props>> & Record<string, unknown>
> {
  const { tagName, properties, events } = definition;

  const ReactComponent = forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
    const elementRef = useRef<HTMLElement | null>(null);
    const handlersRef = useRef<Record<string, EventListener>>({});
    const prevPropsRef = useRef<Record<string, unknown>>({});
    const lastElementRef = useRef<HTMLElement | null>(null);

    useImperativeHandle(ref, () => elementRef.current as HTMLElement);

    // Update handler references on every render
    handlersRef.current = {};
    if (events) {
      for (const eventName of Object.keys(events)) {
        const propKey = Object.keys(props).find((key) => key.toLowerCase() === `on${eventName.toLowerCase()}`);
        const handler = propKey ? props[propKey] : undefined;
        if (typeof handler === "function") {
          handlersRef.current[eventName] = handler as EventListener;
        }
      }
    }

    // Sync properties when props change
    useEffect(() => {
      const element = elementRef.current;
      if (!element) {
        return;
      }

      const isNewElement = element !== lastElementRef.current;
      if (isNewElement) {
        lastElementRef.current = element;
        prevPropsRef.current = {};
      }

      if (properties) {
        for (const propName of Object.keys(properties)) {
          const value = propName in props ? props[propName] : undefined;
          const prevValue = prevPropsRef.current[propName];
          if (isNewElement || !Object.is(value, prevValue)) {
            (element as unknown as Record<string, unknown>)[propName] = value;
            prevPropsRef.current[propName] = value;
          }
        }
      }
    });

    // Bind event listeners once on mount
    useEffect(() => {
      const element = elementRef.current;
      if (!element) {
        return;
      }

      const activeListeners: Array<[string, EventListener]> = [];
      if (events) {
        for (const eventName of Object.keys(events)) {
          const listener = (event: Event) => {
            const handler = handlersRef.current[eventName];
            if (handler) {
              handler(event);
            }
          };
          element.addEventListener(eventName, listener);
          activeListeners.push([eventName, listener]);
        }
      }

      return () => {
        for (const [eventName, listener] of activeListeners) {
          element.removeEventListener(eventName, listener);
        }
      };
    }, []);

    // Construct properties to pass to React.createElement
    const elementProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      const isProperty = properties && key in properties;
      const isEvent = events && key.toLowerCase().startsWith("on") && key.slice(2).toLowerCase() in events;

      if (!isProperty && !isEvent) {
        if (key === "className") {
          elementProps.class = value;
        } else {
          elementProps[key] = value;
        }
      }
    }

    return React.createElement(tagName, { ...elementProps, ref: elementRef });
  });

  ReactComponent.displayName = `ReactComponent(${tagName})`;

  return ReactComponent;
}

/**
 * A React component wrapper for the native `<ch-button>` custom element.
 * Supports reactive properties, events, and ref forwarding.
 * Register the native definition from `@codenhub/components/lib` before use.
 *
 * @example
 * ```tsx
 * <ChButton label="Submit" variant="primary" onClick={() => console.log("Clicked")} />
 * ```
 */
export const ChButton = createReactWrapper(ChButtonDefinition);
