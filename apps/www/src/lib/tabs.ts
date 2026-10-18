/**
 * Wires a WAI-ARIA tablist: click and arrow, Home, and End keys select a tab
 * and show its panel (named by `aria-controls`), hiding the others.
 * @param root Element holding the `role="tab"` buttons.
 * @param onSelect Called with the tab the visitor selected.
 * @returns A function that selects a tab without moving focus.
 */
export function bindTabs(
  root: HTMLElement,
  onSelect?: (tab: HTMLButtonElement) => void,
): (tab: HTMLButtonElement) => void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

  const show = (tab: HTMLButtonElement): void => {
    for (const candidate of tabs) {
      const isSelected = candidate === tab;
      candidate.setAttribute("aria-selected", String(isSelected));
      candidate.tabIndex = isSelected ? 0 : -1;
      const panel = document.getElementById(candidate.getAttribute("aria-controls") ?? "");
      if (panel !== null) {
        panel.hidden = !isSelected;
      }
    }
  };

  root.addEventListener("click", (event) => {
    const tab = (event.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (tab !== null && tabs.includes(tab)) {
      show(tab);
      onSelect?.(tab);
    }
  });

  root.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    if (index === -1) {
      return;
    }
    const next =
      event.key === "ArrowRight"
        ? tabs[(index + 1) % tabs.length]
        : event.key === "ArrowLeft"
          ? tabs[(index - 1 + tabs.length) % tabs.length]
          : event.key === "Home"
            ? tabs[0]
            : event.key === "End"
              ? tabs.at(-1)
              : undefined;
    if (next !== undefined) {
      event.preventDefault();
      show(next);
      next.focus();
      onSelect?.(next);
    }
  });

  return show;
}
