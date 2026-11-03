/**
 * How toasts and dialogs share the top layer. The browser makes everything
 * outside an open modal dialog inert, so while a dialog from this package is
 * open, the toast stacks in its parent element live inside it. The two sides
 * meet only through these DOM attributes, so neither entrypoint has to import
 * the other's code.
 */

/** Marks an open dialog that holds toast stacks; its value orders dialogs by when they opened. */
const LAYER_HOST_ATTRIBUTE = "data-toast-layer-host";

/**
 * Where toasts rendered into `parent` go: the most recently opened dialog in
 * it from this package, or `parent` itself when none is open.
 */
export function getToastLayerHost(parent: HTMLElement): HTMLElement {
  let host = parent;
  let latestOrder = -1;
  for (const child of parent.children) {
    const order = Number(child.getAttribute(LAYER_HOST_ATTRIBUTE) ?? Number.NaN);
    if (order > latestOrder) {
      latestOrder = order;
      host = child as HTMLElement;
    }
  }
  return host;
}

/**
 * Moves every toast stack in `from` to `to`. Live regions stay behind: a
 * region inserted somewhere new may not be tracked again by assistive
 * technology, so a new host gets its own.
 */
function moveStacks(from: HTMLElement, to: HTMLElement): void {
  const stacks = Array.from(from.children).filter((child) => child.hasAttribute("data-toast-container"));
  if (stacks.length === 0) {
    return;
  }
  const documentRef = to.ownerDocument;
  const focused = documentRef.activeElement;
  to.append(...stacks);
  // Moving a node takes focus out of it.
  if (
    focused instanceof documentRef.defaultView!.HTMLElement &&
    focused !== documentRef.activeElement &&
    to.contains(focused)
  ) {
    focused.focus({ preventScroll: true });
  }
}

/** Makes a dialog just opened in `parent` the toasts' host, moving the stacks already showing into it. */
export function hostToastLayers(parent: HTMLElement, dialog: HTMLDialogElement): void {
  const previous = getToastLayerHost(parent);
  // Ordered from the DOM, not a module counter, so two copies of the package on one page agree.
  const order = previous === parent ? 1 : Number(previous.getAttribute(LAYER_HOST_ATTRIBUTE)) + 1;
  dialog.setAttribute(LAYER_HOST_ATTRIBUTE, String(order));
  moveStacks(previous, dialog);
}

/**
 * Stops a closing dialog from hosting toasts. When it was the current host,
 * its stacks move to the dialog opened before it that is still open, or back
 * to `parent`. A no-op for a dialog that is not hosting.
 */
export function releaseToastLayers(parent: HTMLElement, dialog: HTMLDialogElement): void {
  if (!dialog.hasAttribute(LAYER_HOST_ATTRIBUTE)) {
    return;
  }
  const wasCurrent = getToastLayerHost(parent) === dialog;
  dialog.removeAttribute(LAYER_HOST_ATTRIBUTE);
  if (wasCurrent) {
    moveStacks(dialog, getToastLayerHost(parent));
  }
}
