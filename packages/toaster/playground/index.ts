import { toast, dialog } from "@codenhub/toaster";
import type { ToastHandle, ToastPosition } from "@codenhub/toaster";

// --- Theme Toggle ------------------------------------------------------------
// Theme init is handled in the HTML inline script to prevent FOUC.
// This listener only handles the toggle click.
const btnToggleTheme = document.getElementById("btn-toggle-theme") as HTMLButtonElement;
if (btnToggleTheme) {
  btnToggleTheme.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    localStorage.setItem("playground-theme-pref", isDark ? "dark" : "light");
  });
}

// --- Shared dispatch options -------------------------------------------------
function getOptions() {
  const positionSelect = document.getElementById("select-position") as HTMLSelectElement;
  const durationInput = document.getElementById("input-duration") as HTMLInputElement;
  const autoDismissCheck = document.getElementById("check-auto-dismiss") as HTMLInputElement;
  const dismissibleCheck =
    (document.getElementById("check-dismissible") as HTMLInputElement) ??
    (document.getElementById("check-dismissable") as HTMLInputElement);

  return {
    position: (positionSelect?.value || "bottom-right") as ToastPosition,
    duration: Number(durationInput?.value) || 4000,
    autoDismiss: autoDismissCheck ? autoDismissCheck.checked : true,
    dismissible: dismissibleCheck ? dismissibleCheck.checked : true,
  };
}

// --- Semantic toasts ---------------------------------------------------------
document.getElementById("btn-success")?.addEventListener("click", () => {
  toast.success("Changes saved successfully!", {
    ...getOptions(),
    description: "All pending changes were committed to the remote branch.",
    action: {
      label: "Undo",
      onClick: (_event, handle) => {
        handle.dismiss();
        toast.info("Save undone.");
      },
    },
  });
});

document.getElementById("btn-error")?.addEventListener("click", () => {
  toast.error("Failed to sync database records.", getOptions());
});

document.getElementById("btn-warning")?.addEventListener("click", () => {
  toast.warning("Disk space running low (92% used).", getOptions());
});

document.getElementById("btn-info")?.addEventListener("click", () => {
  toast.info("System maintenance scheduled at midnight.", getOptions());
});

// --- Interactive dialogs -----------------------------------------------------
document.getElementById("btn-alert")?.addEventListener("click", async () => {
  await dialog.alert("This action cannot be undone. Are you sure you understand the consequences?", {
    okLabel: "Understood",
  });
  toast.success("Alert acknowledged.");
});

document.getElementById("btn-confirm")?.addEventListener("click", async () => {
  const confirmed = await dialog.confirm("Do you want to permanently delete this project workspace?", {
    confirmLabel: "Delete Workspace",
    cancelLabel: "Abort",
    type: "error",
  });
  if (confirmed) {
    toast.success("Workspace deleted.");
  } else {
    toast.info("Action cancelled.");
  }
});

document.getElementById("btn-prompt")?.addEventListener("click", async () => {
  const value = await dialog.prompt("Enter new workspace namespace:", {
    defaultValue: "my-organization",
    placeholder: "workspace-slug",
    submitLabel: "Register",
    cancelLabel: "Cancel",
  });
  if (value !== null) {
    toast.success(`Namespace registered: ${value}`);
  }
});

// --- Loading toasts ----------------------------------------------------------
let activeLoader: ToastHandle | null = null;

document.getElementById("btn-loading")?.addEventListener("click", () => {
  activeLoader?.dismiss();
  activeLoader = toast.loading("Processing payment gateway request...", getOptions());
});

document.getElementById("btn-loading-sim")?.addEventListener("click", async () => {
  const opts = getOptions();
  const simulatedWork = new Promise<string>((resolve) => {
    setTimeout(() => resolve("Data loaded successfully!"), 2000);
  });

  await toast.promise(simulatedWork, {
    loading: "Fetching API data. Please wait...",
    success: (data) => data,
    error: (err) => `Failed: ${String(err)}`,
    position: opts.position,
    duration: opts.duration,
  });
});

document.getElementById("btn-clear-all")?.addEventListener("click", () => {
  toast.clear();
  activeLoader = null;
});
