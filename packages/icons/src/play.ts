let replayCount = 0;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DATA_URL_HEAD = /data:image\/svg\+xml(?:;[^,]*)?,/;

/** Options shared by the playback helpers. */
export interface IconPlaybackOptions {
  /** Class and custom property prefix. Defaults to `"ic"`. */
  prefix?: string;
}

/**
 * Plays one icon's motion from the start: its `ic-anim-*` glyph motion and its
 * animated artwork, whichever it has.
 *
 * @param element - Icon to play. Elements with neither are ignored.
 * @param options - Class and custom property prefix.
 * @remarks
 * Does nothing when the device requests reduced motion. Glyph motion restarts,
 * whether running or finished, by clearing the element's `animation-name` for one
 * style recalculation; this forces style. Artwork in a CSS mask restarts
 * from a fresh data URL set inline as `--ic-mask`, because a browser does not
 * restart an image it has already shown; {@link bindIconPlayback} removes that
 * override when the trigger ends. An inline `<svg>` restarts with
 * `setCurrentTime(0)`. Verified in Chrome; Firefox and Safari are untested.
 */
export function playIcon(element: Element, options?: IconPlaybackOptions): void {
  const view = element.ownerDocument.defaultView;
  if (!view || view.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const prefix = options?.prefix ?? "ic";
  const style = (element as HTMLElement).style;
  if (style && element.getAttribute("class")?.includes(`${prefix}-anim-`)) {
    // A finished animation is gone from getAnimations(), so restart by removing
    // the animation for one style recalculation instead of rewinding it.
    const previous = style.getPropertyValue("animation-name");
    const priority = style.getPropertyPriority("animation-name");
    style.setProperty("animation-name", "none", "important");
    void view.getComputedStyle(element).animationName;
    if (previous) {
      style.setProperty("animation-name", previous, priority);
    } else {
      style.removeProperty("animation-name");
    }
  }
  if (element.namespaceURI === SVG_NAMESPACE && element.localName === "svg") {
    (element as SVGSVGElement).setCurrentTime(0);
    return;
  }
  const property = `--${prefix}-mask`;
  const mask = view.getComputedStyle(element).getPropertyValue(property);
  if (DATA_URL_HEAD.test(mask)) {
    // Each displayed URL keeps its own SMIL timeline, so a new one starts over.
    replayCount += 1;
    (element as HTMLElement).style.setProperty(
      property,
      mask.replace(DATA_URL_HEAD, `data:image/svg+xml;n=${String(replayCount)},`),
    );
  }
}

/**
 * Plays every `ic-on-hover` icon in a subtree from the start each time its
 * trigger is hovered or gets visible keyboard focus.
 *
 * @param root - Subtree holding the triggers and their icons. Defaults to `document` in a browser.
 * @param options - Class and custom property prefix.
 * @returns A function that removes the listeners and the inline overrides they left.
 * @remarks
 * The trigger is the icon itself, its parent, or any ancestor carrying
 * `ic-trigger`, the same rule the `ic-on-hover` CSS follows. CSS alone already
 * restarts glyph motion and looping artwork; this is what replays one-shot
 * artwork, such as a Line MD draw-in, on every hover rather than once per page.
 * Icons inserted later are covered. Importing the module touches no globals;
 * calling it outside a browser without a root returns a no-op.
 */
export function bindIconPlayback(
  root: Document | Element | undefined = typeof document === "undefined" ? undefined : document,
  options?: IconPlaybackOptions,
): () => void {
  if (!root) {
    return () => {};
  }
  const prefix = options?.prefix ?? "ic";
  const iconSelector = `.${prefix}-on-hover`;
  const triggerSelector = `.${prefix}-trigger`;
  const hovered = new Set<Element>();
  const focused = new Set<Element>();

  /** Icons a trigger element plays: itself, its children, and every icon under it when it is an `ic-trigger`. */
  function iconsOf(trigger: Element): Element[] {
    const icons = trigger.matches(triggerSelector)
      ? [...trigger.querySelectorAll(iconSelector)]
      : [...trigger.children].filter((child) => child.matches(iconSelector));
    return trigger.matches(iconSelector) ? [trigger, ...icons] : icons;
  }

  /** Icons whose trigger is `target` or one of its ancestors inside the root. */
  function activeIcons(target: EventTarget | null, isPointer: boolean): Set<Element> {
    if (!(target instanceof Element) || !root!.contains(target)) {
      return new Set();
    }
    if (!isPointer) {
      // Focus counts for the trigger itself only, as in the CSS.
      return new Set(target.matches(":focus-visible") ? iconsOf(target) : []);
    }
    // Hovering an element hovers each of its ancestors too.
    const active = new Set<Element>();
    for (let node: Element | null = target; node; node = node.parentElement) {
      for (const icon of iconsOf(node)) {
        active.add(icon);
      }
      if (node === root) {
        break;
      }
    }
    return active;
  }

  function release(icon: Element): void {
    (icon as HTMLElement).style?.removeProperty(`--${prefix}-mask`);
  }

  function update(event: Event): void {
    const isPointer = event.type.startsWith("pointer");
    const isEntering = event.type === "pointerover" || event.type === "focusin";
    const target = isEntering ? event.target : (event as FocusEvent).relatedTarget;
    const current = isPointer ? hovered : focused;
    const other = isPointer ? focused : hovered;
    const active = activeIcons(target, isPointer);
    for (const icon of active) {
      if (!current.has(icon)) {
        current.add(icon);
        if (!other.has(icon)) {
          playIcon(icon, options);
        }
      }
    }
    for (const icon of current) {
      if (!active.has(icon)) {
        current.delete(icon);
        if (!other.has(icon)) {
          release(icon);
        }
      }
    }
  }

  const events = ["pointerover", "pointerout", "focusin", "focusout"];
  for (const name of events) {
    root.addEventListener(name, update);
  }
  return () => {
    for (const name of events) {
      root.removeEventListener(name, update);
    }
    for (const icon of new Set([...hovered, ...focused])) {
      release(icon);
    }
    hovered.clear();
    focused.clear();
  };
}
