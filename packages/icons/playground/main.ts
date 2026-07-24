import { generateBaseCss, generateIconCss, lucideIconSet } from "@codenhub/icons";

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
function injectIconStyles(): void {
  const styleEl = document.createElement("style");
  styleEl.id = "dynamic-icons-styles";

  const cssChunks: string[] = [generateBaseCss({ prefix: "ic" })];

  for (const icon of icons) {
    const selectors = [`.ic-${icon.name}`];
    for (const alias of icon.alt) {
      selectors.push(`.ic-${alias}`);
    }
    cssChunks.push(generateIconCss(selectors, icon.svg));
  }

  styleEl.textContent = cssChunks.join("\n");
  document.head.appendChild(styleEl);
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

  const colorPicker = document.getElementById("icon-color-picker") as HTMLInputElement | null;
  const colorResetBtn = document.getElementById("color-reset-btn") as HTMLButtonElement | null;
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

    if (filtered.length === 0) {
      iconGrid.innerHTML = `<div class="empty-state">No icons matching "${searchQuery}"</div>`;
      return;
    }

    iconGrid.innerHTML = "";

    const fragment = document.createDocumentFragment();
    for (const icon of filtered) {
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
          await navigator.clipboard.writeText(iconToCopy.svg);
          showToast(`Copied SVG for "${iconToCopy.name}"`);
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
      const blob = new Blob([currentSelectedIcon.svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentSelectedIcon.name}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${currentSelectedIcon.name}.svg`);
    });
  }

  // Initial render
  renderGrid();
});
