import { generateBaseCss, generateIconCss, lucideIconSet, setSvgStrokeWidth } from "@codenhub/icons";

import "./style.css";

interface IconItem {
  name: string;
  svg: string;
  alt: string[];
}

// 1. Process dataset from lucideIconSet
const icons: IconItem[] = Object.entries(lucideIconSet.icons).map(([name, entry]) => {
  if (typeof entry === "string") {
    return { name, svg: entry, alt: [] };
  }
  return {
    name,
    svg: entry.svg,
    alt: entry.alt ?? [],
  };
});

// 2. Inject CSS rules for all icons into head
function injectIconStyles(strokeWidth?: number): void {
  let styleEl = document.getElementById("dynamic-icons-styles") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dynamic-icons-styles";
    document.head.appendChild(styleEl);
  }

  const cssChunks: string[] = [generateBaseCss({ prefix: "ic" })];

  for (const icon of icons) {
    const selectors = [`.ic-${icon.name}`];
    for (const alias of icon.alt) {
      selectors.push(`.ic-${alias}`);
    }

    let svg = icon.svg;
    if (strokeWidth !== undefined) {
      svg = setSvgStrokeWidth(svg, strokeWidth);
    }

    cssChunks.push(generateIconCss(selectors, svg));
  }

  styleEl.textContent = cssChunks.join("\n");
}

injectIconStyles();

// 3. Theme Toggle Setup
function initTheme(): void {
  const storedTheme = localStorage.getItem("theme");
  const isDark = storedTheme === "dark" || (!storedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);

  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("light", !isDark);
}

function getDefaultColorForTheme(): string {
  return document.documentElement.classList.contains("dark") ? "#ffffff" : "#0f172a";
}

function toggleTheme(): void {
  const isDarkNow = document.documentElement.classList.contains("dark");
  const nextDark = !isDarkNow;

  document.documentElement.classList.toggle("dark", nextDark);
  document.documentElement.classList.toggle("light", !nextDark);
  localStorage.setItem("theme", nextDark ? "dark" : "light");

  const colorPicker = document.getElementById("icon-color-picker") as HTMLInputElement | null;
  const currentColorVal = getComputedStyle(document.documentElement).getPropertyValue("--playground-icon-color").trim();
  if (colorPicker && (currentColorVal === "currentColor" || !currentColorVal)) {
    colorPicker.value = getDefaultColorForTheme();
  }
}

initTheme();

// 4. State
let searchQuery = "";
let currentSelectedIcon: IconItem | null = null;
let currentStrokeWidth = 2.0;
let currentPage = 1;
const targetRows = 10;

// 5. Toast Feedback
function showToast(message: string): void {
  let toast = document.getElementById("toast-feedback");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-feedback";
    toast.className = "toast-feedback";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast?.classList.remove("show");
  }, 2000);
}

// 6. DOM Elements and Rendering
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
  const iconGrid = document.getElementById("icon-grid") as HTMLElement | null;
  const paginationControls = document.getElementById("pagination-controls") as HTMLElement | null;

  const colorPicker = document.getElementById("icon-color-picker") as HTMLInputElement | null;
  const colorResetBtn = document.getElementById("color-reset-btn") as HTMLButtonElement | null;
  const strokeWidthBtn = document.getElementById("stroke-width-btn") as HTMLButtonElement | null;
  const strokeWidthPopover = document.getElementById("stroke-width-popover") as HTMLElement | null;
  const strokeWidthSlider = document.getElementById("stroke-width-slider") as HTMLInputElement | null;
  const strokeWidthValue = document.getElementById("stroke-width-value") as HTMLElement | null;
  const themeToggleBtn = document.getElementById("theme-toggle") as HTMLButtonElement | null;

  // Modal elements
  const modalBackdrop = document.getElementById("icon-modal-backdrop") as HTMLElement | null;
  const modalCloseBtn = document.getElementById("modal-close-btn") as HTMLButtonElement | null;
  const modalIconUpscaled = document.getElementById("modal-icon-upscaled") as HTMLElement | null;
  const modalIconTitle = document.getElementById("modal-icon-title") as HTMLElement | null;
  const modalAliases = document.getElementById("modal-aliases") as HTMLElement | null;
  const modalCodeSnippet = document.getElementById("modal-code-snippet") as HTMLElement | null;
  const copyHtmlBtn = document.getElementById("copy-html-btn") as HTMLButtonElement | null;
  const copySvgBtn = document.getElementById("copy-svg-btn") as HTMLButtonElement | null;
  const downloadSvgBtn = document.getElementById("download-svg-btn") as HTMLButtonElement | null;

  if (colorPicker) {
    colorPicker.value = getDefaultColorForTheme();
  }

  if (searchInput) {
    searchInput.placeholder = `Search ${icons.length.toLocaleString("en-US")} icons...`;
  }

  function renderGrid(): void {
    if (!iconGrid) {
      return;
    }

    const query = searchQuery.trim().toLowerCase();
    const filtered = icons.filter((icon) => {
      if (!query) {
        return true;
      }
      if (icon.name.toLowerCase().includes(query)) {
        return true;
      }
      return icon.alt.some((alias) => alias.toLowerCase().includes(query));
    });

    // Calculate columns and items per page dynamically to ensure all rows are filled
    const cols = Math.floor((iconGrid.getBoundingClientRect().width + 8 + 0.5) / 64) || 8;
    const itemsPerPage = cols * targetRows;

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) {
      currentPage = Math.max(1, totalPages);
    }

    if (filtered.length === 0) {
      iconGrid.innerHTML = `<div class="empty-state">No icons matching "${searchQuery}"</div>`;
      if (paginationControls) {
        paginationControls.innerHTML = "";
      }
      return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filtered.length);
    const pageItems = filtered.slice(startIndex, endIndex);

    iconGrid.innerHTML = "";

    const fragment = document.createDocumentFragment();
    for (const icon of pageItems) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "icon-card";
      card.setAttribute("aria-label", `View icon details for ${icon.name}`);
      card.setAttribute("title", icon.name);

      const preview = document.createElement("div");
      preview.className = "icon-preview";

      const iEl = document.createElement("i");
      iEl.className = `ic-${icon.name}`;
      preview.appendChild(iEl);

      card.appendChild(preview);

      card.addEventListener("click", () => {
        openModal(icon);
      });

      fragment.appendChild(card);
    }

    iconGrid.appendChild(fragment);

    if (paginationControls) {
      renderPaginationControls(totalPages);
    }
  }

  function renderPaginationControls(totalPages: number): void {
    if (!paginationControls) {
      return;
    }

    if (totalPages <= 1) {
      paginationControls.innerHTML = "";
      return;
    }

    paginationControls.innerHTML = "";

    // Prev button
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = `btn ghost secondary sm icon ${currentPage === 1 ? "disabled" : ""}`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.setAttribute("aria-label", "Previous page");
    prevBtn.innerHTML = `<i class="ic-chevron-left ic-stroke-3"></i>`;
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderGrid();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    paginationControls.appendChild(prevBtn);

    // Helper to add a page button
    const addPageButton = (page: number) => {
      const btn = document.createElement("button");
      btn.type = "button";
      if (currentPage === page) {
        btn.className = "btn secondary sm";
      } else {
        btn.className = "btn ghost secondary sm";
      }
      btn.textContent = page.toString();
      btn.addEventListener("click", () => {
        currentPage = page;
        renderGrid();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      paginationControls.appendChild(btn);
    };

    // Helper to add ellipsis
    const addEllipsis = () => {
      const span = document.createElement("span");
      span.className = "pagination-ellipsis";
      span.textContent = "...";
      paginationControls.appendChild(span);
    };

    const maxVisiblePages = 5;
    if (totalPages <= maxVisiblePages + 2) {
      for (let i = 1; i <= totalPages; i++) {
        addPageButton(i);
      }
    } else {
      addPageButton(1);

      if (currentPage > 3) {
        addEllipsis();
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        addPageButton(i);
      }

      if (currentPage < totalPages - 2) {
        addEllipsis();
      }

      addPageButton(totalPages);
    }

    // Next button
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = `btn ghost secondary sm icon ${currentPage === totalPages ? "disabled" : ""}`;
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.setAttribute("aria-label", "Next page");
    nextBtn.innerHTML = `<i class="ic-chevron-right ic-stroke-3"></i>`;
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderGrid();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    paginationControls.appendChild(nextBtn);
  }

  function openModal(icon: IconItem): void {
    currentSelectedIcon = icon;
    if (!modalBackdrop) {
      return;
    }

    if (modalIconUpscaled) {
      modalIconUpscaled.innerHTML = `<i class="ic-${icon.name}"></i>`;
    }

    if (modalIconTitle) {
      modalIconTitle.textContent = icon.name;
    }

    if (modalAliases) {
      if (icon.alt.length > 0) {
        modalAliases.innerHTML = icon.alt.map((alias) => `<span class="badge soft">${alias}</span>`).join("");
      } else {
        modalAliases.innerHTML = "";
      }
    }

    const htmlSnippet = `<i class="ic-${icon.name}"></i>`;
    if (modalCodeSnippet) {
      modalCodeSnippet.textContent = htmlSnippet;
    }

    modalBackdrop.classList.add("open");
  }

  function closeModal(): void {
    if (!modalBackdrop) {
      return;
    }
    modalBackdrop.classList.remove("open");
    currentSelectedIcon = null;
  }

  // Event Listeners
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = (e.target as HTMLInputElement).value;
      currentPage = 1;
      renderGrid();
    });
  }

  if (colorPicker) {
    colorPicker.addEventListener("input", (e) => {
      const hexColor = (e.target as HTMLInputElement).value;
      document.documentElement.style.setProperty("--playground-icon-color", hexColor);
    });
  }

  if (colorResetBtn) {
    colorResetBtn.addEventListener("click", () => {
      if (colorPicker) {
        colorPicker.value = getDefaultColorForTheme();
      }
      document.documentElement.style.setProperty("--playground-icon-color", "currentColor");
      showToast("Reset icon color to currentColor");
    });
  }

  if (strokeWidthBtn && strokeWidthPopover) {
    strokeWidthBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      strokeWidthPopover.classList.toggle("open");
    });
  }

  document.addEventListener("click", (e) => {
    if (strokeWidthPopover && strokeWidthPopover.classList.contains("open")) {
      const target = e.target as HTMLElement;
      if (!strokeWidthPopover.contains(target) && strokeWidthBtn && !strokeWidthBtn.contains(target)) {
        strokeWidthPopover.classList.remove("open");
      }
    }
  });

  if (strokeWidthSlider) {
    strokeWidthSlider.addEventListener("input", (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      currentStrokeWidth = val;
      if (strokeWidthValue) {
        strokeWidthValue.textContent = `${val.toFixed(2)}px`;
      }
      injectIconStyles(val);
    });

    strokeWidthSlider.addEventListener("dblclick", () => {
      strokeWidthSlider.value = "2.0";
      currentStrokeWidth = 2.0;
      if (strokeWidthValue) {
        strokeWidthValue.textContent = "2.00px";
      }
      injectIconStyles(2.0);
    });
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  });

  if (copyHtmlBtn) {
    copyHtmlBtn.addEventListener("click", () => {
      if (!currentSelectedIcon) {
        return;
      }
      const htmlSnippet = `<i class="ic-${currentSelectedIcon.name}"></i>`;
      void (async () => {
        try {
          await navigator.clipboard.writeText(htmlSnippet);
          showToast(`Copied HTML: ${htmlSnippet}`);
        } catch {
          showToast("Failed to copy HTML");
        }
      })();
    });
  }

  if (copySvgBtn) {
    copySvgBtn.addEventListener("click", () => {
      if (!currentSelectedIcon) {
        return;
      }
      const iconToCopy = currentSelectedIcon;
      void (async () => {
        try {
          const svgContent = setSvgStrokeWidth(iconToCopy.svg, currentStrokeWidth);
          await navigator.clipboard.writeText(svgContent);
          showToast(`Copied SVG for "${iconToCopy.name}" (${currentStrokeWidth.toFixed(2)}px)`);
        } catch {
          showToast("Failed to copy SVG");
        }
      })();
    });
  }

  if (downloadSvgBtn) {
    downloadSvgBtn.addEventListener("click", () => {
      if (!currentSelectedIcon) {
        return;
      }
      const svgContent = setSvgStrokeWidth(currentSelectedIcon.svg, currentStrokeWidth);
      const blob = new Blob([svgContent], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentSelectedIcon.name}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${currentSelectedIcon.name}.svg (${currentStrokeWidth.toFixed(2)}px)`);
    });
  }

  // Initial render
  renderGrid();

  // Re-render grid on window resize to ensure rows are always full
  window.addEventListener("resize", () => {
    renderGrid();
  });
});
