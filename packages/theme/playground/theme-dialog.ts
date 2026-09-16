import type { StoredTheme } from "./theme-store";

/** Action the theme editor dialog hands back to the caller on save. Returns `false` to keep the dialog open, e.g. on a rejected duplicate name. */
export interface ThemeDialogHandlers {
  onSave: (theme: StoredTheme, editIndex: number) => boolean;
}

/** Controls the shared "Create/Edit Theme" dialog. */
export interface ThemeDialog {
  /** Opens the dialog. Pass a theme and its index to edit it; omit both to create a new one. */
  open: (schema: Record<string, string>, theme?: StoredTheme, editIndex?: number) => void;
}

/** Wires the theme editor dialog already present in the page markup. */
export function createThemeDialog(handlers: ThemeDialogHandlers): ThemeDialog {
  const dialog = document.getElementById("theme-dialog") as HTMLDialogElement | null;
  const form = document.getElementById("form-theme") as HTMLFormElement | null;
  const title = document.getElementById("form-theme-title");
  const editIndexInput = document.getElementById("theme-edit-index") as HTMLInputElement | null;
  const nameInput = document.getElementById("theme-name") as HTMLInputElement | null;
  const schemeSelect = document.getElementById("theme-scheme") as HTMLSelectElement | null;
  const valuesContainer = document.getElementById("theme-token-values");

  function close(): void {
    dialog?.close();
    form?.reset();
  }

  document.getElementById("btn-cancel-theme")?.addEventListener("click", close);
  document.getElementById("btn-cancel-theme-secondary")?.addEventListener("click", close);

  function renderTokenInputs(schema: Record<string, string>, tokens: Record<string, string>): void {
    if (!valuesContainer) {
      return;
    }
    valuesContainer.replaceChildren(
      ...Object.keys(schema).map((key) => {
        const row = document.createElement("div");
        row.className = "grid grid-cols-3 items-center gap-2 text-xs";

        const label = document.createElement("label");
        label.className = "truncate text-text-secondary";
        label.textContent = key;

        const input = document.createElement("input");
        input.type = "text";
        input.dataset.tokenKey = key;
        input.className = "col-span-2 w-full";
        input.placeholder = "#ffffff or rgb(...)";
        input.value = tokens[key] ?? "";

        row.append(label, input);
        return row;
      }),
    );
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput?.value.trim();
    const colorScheme = schemeSelect?.value as "light" | "dark" | undefined;
    if (!name || !colorScheme) {
      return;
    }

    const tokens: Record<string, string> = {};
    valuesContainer?.querySelectorAll<HTMLInputElement>("[data-token-key]").forEach((input) => {
      const key = input.dataset.tokenKey;
      if (key) {
        tokens[key] = input.value.trim();
      }
    });

    const editIndex = Number(editIndexInput?.value ?? "-1");
    if (handlers.onSave({ name, colorScheme, tokens }, editIndex)) {
      close();
    }
  });

  return {
    open: (schema, theme, editIndex) => {
      if (title) {
        title.textContent = theme ? `Edit Theme: ${theme.name}` : "Create Theme";
      }
      if (editIndexInput) {
        editIndexInput.value = String(editIndex ?? -1);
      }
      if (nameInput) {
        nameInput.value = theme?.name ?? "";
      }
      if (schemeSelect) {
        schemeSelect.value = theme?.colorScheme ?? "light";
      }
      renderTokenInputs(schema, theme?.tokens ?? {});
      dialog?.showModal();
    },
  };
}
