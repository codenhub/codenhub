export interface AnchorRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface Size {
  height: number;
  width: number;
}

export interface FloatingPlacementRequest {
  anchor: AnchorRect;
  floating: Size;
  viewport: Size;
  /** Which anchor edge the floating box lines up with. */
  align: "start" | "end";
}

/** Space between the anchor and the floating box. */
const GAP = 8;
/** Space kept between the floating box and the viewport edge. */
const VIEWPORT_MARGIN = 8;

/**
 * Places a floating box (a menu or a preview card) next to its anchor, in
 * viewport coordinates for `position: fixed`.
 *
 * It opens below the anchor, or above when only the space above fits it, and
 * slides sideways to stay inside the viewport.
 */
export function placeFloating({ align, anchor, floating, viewport }: FloatingPlacementRequest): {
  left: number;
  top: number;
} {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - floating.height;
  const fitsBelow = below + floating.height <= viewport.height - VIEWPORT_MARGIN;
  const fitsAbove = above >= VIEWPORT_MARGIN;
  const top = !fitsBelow && fitsAbove ? above : below;

  const preferredLeft = align === "start" ? anchor.left : anchor.right - floating.width;
  const maxLeft = viewport.width - VIEWPORT_MARGIN - floating.width;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, maxLeft));

  return { left, top };
}
