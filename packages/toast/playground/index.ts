import { createToaster } from "@codenhub/toast";
import type { Toast, ToastPosition, ToastTokens } from "@codenhub/toast";

const toaster = createToaster();

// Theme Toggle
const btnToggleTheme = document.getElementById("btn-toggle-theme") as HTMLButtonElement;
if (btnToggleTheme) {
  btnToggleTheme.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("playground-theme-pref", isDark ? "dark" : "light");
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  });
}

// Get Dynamic Options
function getOptions() {
  const positionSelect = document.getElementById("select-position") as HTMLSelectElement;
  const durationInput = document.getElementById("input-duration") as HTMLInputElement;
  const autoDismissCheck = document.getElementById("check-auto-dismiss") as HTMLInputElement;
  const dismissableCheck = document.getElementById("check-dismissable") as HTMLInputElement;

  return {
    position: (positionSelect?.value || "bottom-right") as ToastPosition,
    duration: Number(durationInput?.value) || 4000,
    autoDismiss: autoDismissCheck ? autoDismissCheck.checked : true,
    isDismissable: dismissableCheck ? dismissableCheck.checked : true,
  };
}

// Semantic Buttons
const btnSuccess = document.getElementById("btn-success") as HTMLButtonElement;
btnSuccess?.addEventListener("click", () => {
  const options = getOptions();
  toaster.success("Changes saved successfully!", options);
});

const btnError = document.getElementById("btn-error") as HTMLButtonElement;
btnError?.addEventListener("click", () => {
  const options = getOptions();
  toaster.error("Failed to sync database records.", options);
});

const btnWarning = document.getElementById("btn-warning") as HTMLButtonElement;
btnWarning?.addEventListener("click", () => {
  const options = getOptions();
  toaster.warning("Disk space running low (92% used).", options);
});

const btnInfo = document.getElementById("btn-info") as HTMLButtonElement;
btnInfo?.addEventListener("click", () => {
  const options = getOptions();
  toaster.info("System maintenance scheduled at midnight.", options);
});

// Interactive Dialog Buttons
const btnAlert = document.getElementById("btn-alert") as HTMLButtonElement;
btnAlert?.addEventListener("click", async () => {
  const options = getOptions();
  await toaster.alert("This action cannot be undone. Are you sure you understand the consequences?", {
    position: options.position,
    duration: options.duration,
    okLabel: "Understood",
  });
});

const btnConfirm = document.getElementById("btn-confirm") as HTMLButtonElement;
btnConfirm?.addEventListener("click", async () => {
  const options = getOptions();
  await toaster.confirm("Do you want to permanently delete this project workspace?", {
    position: options.position,
    duration: options.duration,
    confirmLabel: "Delete Workspace",
    cancelLabel: "Abort",
  });
});

const btnPrompt = document.getElementById("btn-prompt") as HTMLButtonElement;
btnPrompt?.addEventListener("click", async () => {
  const options = getOptions();
  await toaster.prompt("Enter new workspace namespace:", "my-organization", {
    position: options.position,
    duration: options.duration,
    placeholder: "workspace-slug",
    submitLabel: "Register",
    cancelLabel: "Cancel",
  });
});

// Loading Toast Buttons
let activeLoader: Toast | null = null;

const btnLoading = document.getElementById("btn-loading") as HTMLButtonElement;
btnLoading?.addEventListener("click", () => {
  const options = getOptions();
  if (activeLoader) {
    activeLoader.hide();
  }
  activeLoader = toaster.loading("Processing payment gateway request...", options);
});

const btnLoadingSim = document.getElementById("btn-loading-sim") as HTMLButtonElement;
btnLoadingSim?.addEventListener("click", () => {
  const options = getOptions();
  const loader = toaster.loading("Fetching API data. Please wait...", options);

  setTimeout(() => {
    loader.hide();
    toaster.success("Data loaded successfully!", {
      position: options.position,
      duration: options.duration,
    });
  }, 2000);
});

const btnClearAll = document.getElementById("btn-clear-all") as HTMLButtonElement;
btnClearAll?.addEventListener("click", () => {
  toaster.clear();
  activeLoader = null;
});

// Custom Tokens Config
const btnApplyTokens = document.getElementById("btn-apply-tokens") as HTMLButtonElement;
btnApplyTokens?.addEventListener("click", () => {
  const successVal = (document.getElementById("token-success") as HTMLInputElement)?.value.trim();
  const destructiveVal = (document.getElementById("token-destructive") as HTMLInputElement)?.value.trim();
  const warningVal = (document.getElementById("token-warning") as HTMLInputElement)?.value.trim();
  const infoVal = (document.getElementById("token-info") as HTMLInputElement)?.value.trim();
  const surfaceVal = (document.getElementById("token-surface") as HTMLInputElement)?.value.trim();
  const textVal = (document.getElementById("token-text") as HTMLInputElement)?.value.trim();

  const tokens: ToastTokens = {};
  if (successVal) {
    tokens.success = successVal;
  }
  if (destructiveVal) {
    tokens.destructive = destructiveVal;
  }
  if (warningVal) {
    tokens.warning = warningVal;
  }
  if (infoVal) {
    tokens.info = infoVal;
  }
  if (surfaceVal) {
    tokens.surface = surfaceVal;
  }
  if (textVal) {
    tokens.text = textVal;
  }

  toaster.configure({ tokens });
});

const btnResetTokens = document.getElementById("btn-reset-tokens") as HTMLButtonElement;
btnResetTokens?.addEventListener("click", () => {
  // Clear inputs
  ["token-success", "token-destructive", "token-warning", "token-info", "token-surface", "token-text"].forEach((id) => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) {
      el.value = "";
    }
  });

  toaster.configure({ tokens: {} });
});
