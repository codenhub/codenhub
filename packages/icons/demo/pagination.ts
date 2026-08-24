const MAX_VISIBLE_PAGES = 5;

function createPageButton(page: number, isCurrent: boolean, onSelect: (page: number) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = isCurrent ? "btn secondary sm" : "btn ghost secondary sm";
  button.textContent = String(page);
  button.addEventListener("click", () => onSelect(page));
  return button;
}

function createStepButton(
  label: string,
  iconClass: string,
  page: number,
  isDisabled: boolean,
  onSelect: (page: number) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn ghost secondary sm icon";
  button.disabled = isDisabled;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<i class="${iconClass}"></i>`;
  button.addEventListener("click", () => onSelect(page));
  return button;
}

function createEllipsis(): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "pagination-ellipsis";
  span.textContent = "…";
  return span;
}

function readVisiblePages(currentPage: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= MAX_VISIBLE_PAGES + 2) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages: (number | "gap")[] = [1];
  if (currentPage > 3) {
    pages.push("gap");
  }
  for (let page = Math.max(2, currentPage - 1); page <= Math.min(totalPages - 1, currentPage + 1); page++) {
    pages.push(page);
  }
  if (currentPage < totalPages - 2) {
    pages.push("gap");
  }
  pages.push(totalPages);
  return pages;
}

/**
 * Renders the pager for a grid of icons.
 *
 * @param container - Element the controls are written into.
 * @param currentPage - Page currently shown, starting at 1.
 * @param totalPages - Number of pages available.
 * @param onSelect - Called with the page a control selects.
 */
export function renderPagination(
  container: HTMLElement,
  currentPage: number,
  totalPages: number,
  onSelect: (page: number) => void,
): void {
  if (totalPages <= 1) {
    container.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.appendChild(
    createStepButton("Previous page", "ic-chevron-left", currentPage - 1, currentPage === 1, onSelect),
  );
  for (const page of readVisiblePages(currentPage, totalPages)) {
    fragment.appendChild(page === "gap" ? createEllipsis() : createPageButton(page, page === currentPage, onSelect));
  }
  fragment.appendChild(
    createStepButton("Next page", "ic-chevron-right", currentPage + 1, currentPage === totalPages, onSelect),
  );

  container.replaceChildren(fragment);
}
