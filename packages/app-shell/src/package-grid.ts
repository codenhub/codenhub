/** Element ids/selectors `initPackageGrid` wires up. Defaults match the shared package-grid markup every host currently renders. */
export interface PackageGridElementIds {
  /** Selector for the "no results" message shown when a search matches nothing. */
  emptyMessageSelector?: string;
  /** Id of the grid element whose children are the package cards. */
  gridId?: string;
  /** Id of the search `<input>`. */
  searchInputId?: string;
  /** Id of the sort `<button>`. */
  sortButtonId?: string;
}

/**
 * Wires search-filter and name-sort behavior for a package/demo index grid.
 *
 * Expects each grid item to carry `data-search` (the lowercased haystack a
 * query matches against) and `data-label` (the value sorted on), and the sort
 * button to carry a `data-sort-direction` attribute plus `[data-sort-label]`
 * and `[data-sort-icon]` descendants. No-ops for any element that is missing,
 * so a page without one of the pieces (e.g. no sort control) still gets
 * filtering.
 *
 * @param ids - Overrides for the default element ids/selectors.
 */
export function initPackageGrid(ids: PackageGridElementIds = {}): void {
  const {
    emptyMessageSelector = "[data-empty-filtered]",
    gridId = "package-grid",
    searchInputId = "package-search",
    sortButtonId = "package-sort",
  } = ids;

  const searchInput = document.getElementById(searchInputId);
  const sortButton = document.getElementById(sortButtonId);
  const sortLabel = sortButton?.querySelector("[data-sort-label]");
  const grid = document.getElementById(gridId);
  const emptyMessage = document.querySelector(emptyMessageSelector);
  const cards = grid
    ? Array.from(grid.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    : [];

  function applyFilter(): void {
    if (!(searchInput instanceof HTMLInputElement)) {
      return;
    }

    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;
    for (const card of cards) {
      const matches = query === "" || (card.dataset.search ?? "").includes(query);
      card.hidden = !matches;
      if (matches) {
        visibleCount += 1;
      }
    }

    if (emptyMessage instanceof HTMLElement) {
      emptyMessage.hidden = visibleCount !== 0;
    }
  }

  function applySort(): void {
    if (!(sortButton instanceof HTMLElement) || grid === null) {
      return;
    }

    const direction = sortButton.dataset.sortDirection === "desc" ? -1 : 1;
    const sorted = [...cards].sort(
      (left, right) => direction * (left.dataset.label ?? "").localeCompare(right.dataset.label ?? ""),
    );
    for (const card of sorted) {
      grid.appendChild(card);
    }
  }

  function toggleSortDirection(): void {
    if (!(sortButton instanceof HTMLElement)) {
      return;
    }

    const nextDirection = sortButton.dataset.sortDirection === "desc" ? "asc" : "desc";
    sortButton.dataset.sortDirection = nextDirection;
    sortButton.setAttribute("aria-pressed", String(nextDirection === "desc"));
    sortButton.setAttribute(
      "aria-label",
      nextDirection === "desc" ? "Sort by name, descending" : "Sort by name, ascending",
    );
    if (sortLabel instanceof HTMLElement) {
      sortLabel.textContent = nextDirection === "desc" ? "Z–A" : "A–Z";
    }

    for (const icon of sortButton.querySelectorAll<HTMLElement>("[data-sort-icon]")) {
      icon.hidden = icon.dataset.sortIcon !== nextDirection;
    }

    applySort();
  }

  searchInput?.addEventListener("input", applyFilter);
  sortButton?.addEventListener("click", toggleSortDirection);
}
