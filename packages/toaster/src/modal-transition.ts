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

  let hasFinished = false;
  const finish = (event?: Event): void => {
    if (event && event.target !== dialog) {
      return;
    }
    if (hasFinished) {
      return;
    }
    hasFinished = true;
    dialog.removeEventListener("transitionend", finish);
    dialog.removeEventListener("transitioncancel", finish);
    windowRef.clearTimeout(timerId);
    onClosed();
  };
  dialog.addEventListener("transitionend", finish);
  dialog.addEventListener("transitioncancel", finish);
  const timerId = windowRef.setTimeout(finish, totalDuration + 50);
  dialog.close();
}
