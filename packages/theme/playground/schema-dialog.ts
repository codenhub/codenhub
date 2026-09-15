/** Actions the token schema dialog hands back to the caller. */
export interface SchemaDialogHandlers {
  onAdd: (key: string, cssVariable: string) => void;
  onDelete: (key: string) => void;
}

/** Controls the "Configure Token Schema" dialog: opening it and its list/add-form wiring. */
export interface SchemaDialog {
  open: () => void;
  renderList: (schema: Record<string, string>) => void;
}

/** Wires the token schema dialog already present in the page markup. */
export function createSchemaDialog(handlers: SchemaDialogHandlers): SchemaDialog {
  const dialog = document.getElementById("schema-dialog") as HTMLDialogElement | null;
  const list = document.getElementById("token-schema-list");
  const form = document.getElementById("form-add-token") as HTMLFormElement | null;
  const keyInput = document.getElementById("new-token-key") as HTMLInputElement | null;
  const variableInput = document.getElementById("new-token-var") as HTMLInputElement | null;

  document.getElementById("btn-close-schema")?.addEventListener("click", () => dialog?.close());

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = keyInput?.value.trim();
    const cssVariable = variableInput?.value.trim();
    if (!key || !cssVariable) {
      return;
    }
    handlers.onAdd(key, cssVariable);
    form.reset();
    keyInput?.focus();
  });

  function renderList(schema: Record<string, string>): void {
    if (!list) {
      return;
    }
    list.replaceChildren(
      ...Object.entries(schema).map(([key, cssVariable]) => {
        const row = document.createElement("div");
        row.className = "flex items-center justify-between rounded-md bg-background p-2 text-xs";
        row.innerHTML = `
          <div class="flex flex-col">
            <span class="font-semibold text-text-strong">${key}</span>
            <code class="text-[10px] text-text-secondary">${cssVariable}</code>
          </div>
          <button type="button" class="btn destructive sm icon" data-delete-schema="${key}" aria-label="Delete ${key}">
            <i class="ic-trash-2 size-3.5"></i>
          </button>
        `;
        row.querySelector<HTMLButtonElement>("[data-delete-schema]")?.addEventListener("click", () => {
          handlers.onDelete(key);
        });
        return row;
      }),
    );
  }

  return {
    open: () => dialog?.showModal(),
    renderList,
  };
}
