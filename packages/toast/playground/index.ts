import { createToaster } from "@codenhub/toast";
import type { ToastPosition } from "@codenhub/toast";

const toaster = createToaster();

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
  const dismissableCheck = document.getElementById("check-dismissable") as HTMLInputElement;

  return {
    position: (positionSelect?.value || "bottom-right") as ToastPosition,
    duration: Number(durationInput?.value) || 4000,
    shouldAutoDismiss: autoDismissCheck ? autoDismissCheck.checked : true,
    isDismissable: dismissableCheck ? dismissableCheck.checked : true,
  };
}

// --- Semantic toasts ---------------------------------------------------------
document.getElementById("btn-success")?.addEventListener("click", () => {
  toaster.success("Changes saved successfully!", getOptions());
});

document.getElementById("btn-error")?.addEventListener("click", () => {
  toaster.error("Failed to sync database records.", getOptions());
});

document.getElementById("btn-warning")?.addEventListener("click", () => {
  toaster.warning("Disk space running low (92% used).", getOptions());
});

document.getElementById("btn-info")?.addEventListener("click", () => {
  toaster.info("System maintenance scheduled at midnight.", getOptions());
});

// --- Interactive dialogs -----------------------------------------------------
document.getElementById("btn-alert")?.addEventListener("click", async () => {
  const handle = toaster.alert("This action cannot be undone. Are you sure you understand the consequences?", {
    okLabel: "Understood",
  });
  await handle.result;
  toaster.semantic.success("Alert acknowledged.");
});

document.getElementById("btn-confirm")?.addEventListener("click", async () => {
  const handle = toaster.confirm("Do you want to permanently delete this project workspace?", {
    confirmLabel: "Delete Workspace",
    cancelLabel: "Abort",
  });
  const confirmed = await handle.result;
  toaster.semantic[confirmed ? "success" : "info"](confirmed ? "Workspace deleted." : "Action cancelled.");
});

document.getElementById("btn-prompt")?.addEventListener("click", async () => {
  const handle = toaster.prompt("Enter new workspace namespace:", {
    defaultValue: "my-organization",
    placeholder: "workspace-slug",
    submitLabel: "Register",
    cancelLabel: "Cancel",
  });
  const value = await handle.result;
  if (value !== null) {
    toaster.success(`Namespace registered: ${value}`);
  }
});

// --- Loading toasts ----------------------------------------------------------
let activeLoader: ReturnType<typeof toaster.loading.show> | null = null;

document.getElementById("btn-loading")?.addEventListener("click", () => {
  activeLoader?.dismiss();
  activeLoader = toaster.loading.show({
    message: "Processing payment gateway request...",
    ...getOptions(),
  });
});

document.getElementById("btn-loading-sim")?.addEventListener("click", () => {
  const opts = getOptions();
  const loader = toaster.loading.show({ message: "Fetching API data. Please wait...", ...opts });

  setTimeout(() => {
    loader.dismiss();
    toaster.success("Data loaded successfully!", { position: opts.position, duration: opts.duration });
  }, 2000);
});

document.getElementById("btn-clear-all")?.addEventListener("click", () => {
  toaster.clear();
  activeLoader = null;
});

// --- Custom token overrides --------------------------------------------------
document.getElementById("btn-apply-tokens")?.addEventListener("click", () => {
  const get = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() || undefined;

  toaster.configure({
    tokens: {
      success: get("token-success"),
      destructive: get("token-destructive"),
      warning: get("token-warning"),
      info: get("token-info"),
      surface: get("token-surface"),
      text: get("token-text"),
    },
  });
});

document.getElementById("btn-reset-tokens")?.addEventListener("click", () => {
  ["token-success", "token-destructive", "token-warning", "token-info", "token-surface", "token-text"].forEach((id) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      el.value = "";
    }
  });
  toaster.configure({ tokens: {} });
});
