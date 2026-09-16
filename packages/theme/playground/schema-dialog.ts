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
  dialog?.addEventListener("close", () => form?.reset());

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

        const info = document.createElement("div");
        info.className = "flex flex-col";
        const name = document.createElement("span");
        name.className = "font-semibold text-text-strong";
        name.textContent = key;
        const variable = document.createElement("code");
        variable.className = "text-[10px] text-text-secondary";
        variable.textContent = cssVariable;
        info.append(name, variable);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "btn destructive sm icon";
        deleteButton.dataset.deleteSchema = key;
        deleteButton.ariaLabel = `Delete ${key}`;
        deleteButton.innerHTML = '<i class="ic-trash-2 size-3.5"></i>';
        deleteButton.addEventListener("click", () => {
          handlers.onDelete(key);
        });

        row.append(info, deleteButton);
        return row;
      }),
    );
  }

  return {
    open: () => dialog?.showModal(),
    renderList,
  };
}
