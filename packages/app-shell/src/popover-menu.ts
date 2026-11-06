/**
 * Makes a `<details>` menu of links behave like a popover: a close plays the
 * list's out animation first, and the menu closes on an outside click or Escape.
 *
 * The menu works without this; it only refines closing. Removing `open` hides
 * the list at once, so a close first sets `data-closing`, whose rule in
 * `styles.css` runs the out animation, and removes `open` after it.
 * @param menu The menu, whose list carries `.shell-menu-list`.
 */
export function enhancePopoverMenu(menu: HTMLDetailsElement): void {
  const summary = menu.querySelector("summary");
  const list = menu.querySelector<HTMLElement>(".shell-menu-list");

  const finish = () => {
    if (menu.hasAttribute("data-closing")) {
      menu.removeAttribute("data-closing");
      menu.open = false;
    }
  };

  const close = async () => {
    if (!menu.open || menu.hasAttribute("data-closing")) {
      return;
    }
    menu.setAttribute("data-closing", "");
    try {
      await Promise.all(list?.getAnimations().map((animation) => animation.finished) ?? []);
    } catch {
      // Cancellation before the first frame rejects too, without an animationcancel event.
    }
    finish();
  };

  summary?.addEventListener("click", (event) => {
    if (!menu.open) {
      return;
    }
    event.preventDefault();
    if (menu.hasAttribute("data-closing")) {
      // Pressed again mid-close: stay open.
      menu.removeAttribute("data-closing");
    } else {
      void close();
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && !menu.contains(event.target)) {
      void close();
    }
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      void close();
      summary?.focus();
    }
  });
}
