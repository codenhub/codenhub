function parseTransitionDuration(durationString?: string, delayString?: string): number {
  const parse = (value?: string): number[] =>
    (value || "0s").split(",").map((part) => {
      const trimmed = part.trim();
      const parsed = Number.parseFloat(trimmed) || 0;
      return trimmed.endsWith("ms") ? parsed : parsed * 1000;
    });
  const durations = parse(durationString);
  const delays = parse(delayString);
  return Math.max(...durations.map((duration, index) => duration + (delays[index % delays.length] ?? 0)));
}

/** Number of properties computed `transition-property` names, dropping "none". */
function countTransitionProperties(propertyString?: string): number {
  return (propertyString ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "none").length;
}

export function closeDialog(dialog: HTMLDialogElement, onClosed: () => void): void {
  if (!dialog.open) {
    onClosed();
    return;
  }
  const windowRef = dialog.ownerDocument.defaultView;
  const style = windowRef?.getComputedStyle(dialog);
  const totalDuration = parseTransitionDuration(style?.transitionDuration, style?.transitionDelay);
  if (!windowRef || totalDuration <= 0 || windowRef.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    onClosed();
    return;
  }

  // How many properties the dialog is expected to transition -- not just
  // whichever one happens to end first. A dialog customized with unequal
  // durations (e.g. a fast opacity fade alongside a slower transform)
  // previously reused the dialog as soon as the fastest property finished,
  // stranding the still-running ones mid-transition. The browser fires one
  // `transitionend`/`transitioncancel` per completing property, so counting
  // qualifying events is enough to wait for all of them without having to
  // correlate each event's `propertyName` back to a specific expected one --
  // which a `transition-property: all` customization would defeat anyway,
  // since such an event never reports "all" literally. Falls back to
  // expecting one event when the property list itself is unavailable
  // (a positive duration says something transitions even then).
  const expectedTransitions = Math.max(1, countTransitionProperties(style?.transitionProperty));

  let hasFinished = false;
  let remainingTransitions = expectedTransitions;
  const finish = (): void => {
    if (hasFinished) {
      return;
    }
    hasFinished = true;
    dialog.removeEventListener("transitionend", handleTransitionEvent);
    dialog.removeEventListener("transitioncancel", handleTransitionEvent);
    windowRef.clearTimeout(timerId);
    onClosed();
  };
  const handleTransitionEvent = (event: Event): void => {
    if (event.target !== dialog) {
      return;
    }
    remainingTransitions -= 1;
    if (remainingTransitions <= 0) {
      finish();
    }
  };
  dialog.addEventListener("transitionend", handleTransitionEvent);
  dialog.addEventListener("transitioncancel", handleTransitionEvent);
  // Bounded fallback in case a property's own end/cancel event never
  // arrives -- the dialog removed mid-transition, or a browser quirk.
  const timerId = windowRef.setTimeout(finish, totalDuration + 50);
  dialog.close();
}
