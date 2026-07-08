import { createToaster } from "@codenhub/toast";
import type { Toast, ToastIcon, ToastPosition, ToastRole, ToastTokens } from "@codenhub/toast";

const toaster = createToaster();

// Theme Toggle
const btnToggleTheme = document.getElementById("btn-toggle-theme") as HTMLButtonElement;
if (btnToggleTheme) {
  btnToggleTheme.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("playground-theme-pref", isDark ? "dark" : "light");
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    log(`Theme switched to ${isDark ? "dark" : "light"} mode`);
  });
}

// Log Utility
const logContainer = document.getElementById("log-container") as HTMLDivElement;
function log(message: string, type: "info" | "success" | "error" | "warning" = "info") {
  if (!logContainer) {
    return;
  }

  // Remove empty states note on first real log
  const placeholder = logContainer.querySelector(".italic");
  if (placeholder) {
    placeholder.remove();
  }

  const logLine = document.createElement("div");
  const time = new Date().toLocaleTimeString();
  logLine.className = "py-0.5 border-b border-border/10 last:border-b-0";

  let badgeColor = "text-blue-500";
  if (type === "success") {
    badgeColor = "text-emerald-500";
  } else if (type === "error") {
    badgeColor = "text-rose-500";
  } else if (type === "warning") {
    badgeColor = "text-amber-500";
  }

  logLine.innerHTML = `<span class="text-text-secondary">[${time}]</span> <span class="${badgeColor} font-bold">${type.toUpperCase()}</span>: ${message}`;
  logContainer.appendChild(logLine);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Clear Logs
const btnClearLogs = document.getElementById("btn-clear-logs") as HTMLButtonElement;
if (btnClearLogs) {
  btnClearLogs.addEventListener("click", () => {
    if (logContainer) {
      logContainer.innerHTML = '<div class="text-text-secondary italic">[Logs cleared. Ready to log actions...]</div>';
    }
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

// Attach Toast Listeners
function attachLifecycleListeners(toast: Toast, toastType: string) {
  toast.onShow(() => log(`${toastType} toast -> onShow event fired`));
  toast.onShown(() => log(`${toastType} toast -> onShown event fired`, "success"));
  toast.onHide(() => log(`${toastType} toast -> onHide event fired`));
  toast.onHidden(() => log(`${toastType} toast -> onHidden event fired`));
}

// Semantic Buttons
const btnSuccess = document.getElementById("btn-success") as HTMLButtonElement;
btnSuccess?.addEventListener("click", () => {
  const options = getOptions();
  log(`Dispatching Success Toast`);
  const toast = toaster.success("Changes saved successfully!", options);
  attachLifecycleListeners(toast, "Success");
});

const btnError = document.getElementById("btn-error") as HTMLButtonElement;
btnError?.addEventListener("click", () => {
  const options = getOptions();
  log(`Dispatching Error Toast`, "error");
  const toast = toaster.error("Failed to sync database records.", options);
  attachLifecycleListeners(toast, "Error");
});

const btnWarning = document.getElementById("btn-warning") as HTMLButtonElement;
btnWarning?.addEventListener("click", () => {
  const options = getOptions();
  log(`Dispatching Warning Toast`, "warning");
  const toast = toaster.warning("Disk space running low (92% used).", options);
  attachLifecycleListeners(toast, "Warning");
});

const btnInfo = document.getElementById("btn-info") as HTMLButtonElement;
btnInfo?.addEventListener("click", () => {
  const options = getOptions();
  log(`Dispatching Info Toast`);
  const toast = toaster.info("System maintenance scheduled at midnight.", options);
  attachLifecycleListeners(toast, "Info");
});

// Interactive Dialog Buttons
const btnAlert = document.getElementById("btn-alert") as HTMLButtonElement;
btnAlert?.addEventListener("click", async () => {
  const options = getOptions();
  log("Opening custom Alert dialog");
  // Alert variants do not have autoDismiss/isDismissable since they require action buttons
  const promise = toaster.alert("This action cannot be undone. Are you sure you understand the consequences?", {
    position: options.position,
    duration: options.duration,
    okLabel: "Understood",
  });
  log("Alert promise pending...");
  await promise;
  log("Alert promise resolved successfully!", "success");
});

const btnConfirm = document.getElementById("btn-confirm") as HTMLButtonElement;
btnConfirm?.addEventListener("click", async () => {
  const options = getOptions();
  log("Opening custom Confirm dialog");
  const promise = toaster.confirm("Do you want to permanently delete this project workspace?", {
    position: options.position,
    duration: options.duration,
    confirmLabel: "Delete Workspace",
    cancelLabel: "Abort",
  });
  log("Confirm promise pending...");
  const result = await promise;
  log(`Confirm promise resolved: ${result}`, result ? "success" : "error");
});

const btnPrompt = document.getElementById("btn-prompt") as HTMLButtonElement;
btnPrompt?.addEventListener("click", async () => {
  const options = getOptions();
  log("Opening custom Prompt dialog");
  const promise = toaster.prompt("Enter new workspace namespace:", "my-organization", {
    position: options.position,
    duration: options.duration,
    placeholder: "workspace-slug",
    submitLabel: "Register",
    cancelLabel: "Cancel",
  });
  log("Prompt promise pending...");
  const result = await promise;
  log(`Prompt promise resolved: ${result === null ? "null (canceled)" : `"${result}"`}`, result !== null ? "success" : "error");
});

// Loading Toast Buttons
let activeLoader: Toast | null = null;

const btnLoading = document.getElementById("btn-loading") as HTMLButtonElement;
btnLoading?.addEventListener("click", () => {
  const options = getOptions();
  if (activeLoader) {
    log("Loader already active. Dismissing it first.");
    activeLoader.hide();
  }
  log("Showing persistent loader");
  activeLoader = toaster.loading("Processing payment gateway request...", options);
  attachLifecycleListeners(activeLoader, "Loader");
});

const btnLoadingSim = document.getElementById("btn-loading-sim") as HTMLButtonElement;
btnLoadingSim?.addEventListener("click", () => {
  const options = getOptions();
  log("Simulating asynchronous operation...");
  const loader = toaster.loading("Fetching API data. Please wait...", options);
  attachLifecycleListeners(loader, "Simulator Loader");

  setTimeout(() => {
    loader.hide();
    const successToast = toaster.success("Data loaded successfully!", {
      position: options.position,
      duration: options.duration,
    });
    attachLifecycleListeners(successToast, "Simulator Success");
  }, 2000);
});

const btnClearAll = document.getElementById("btn-clear-all") as HTMLButtonElement;
btnClearAll?.addEventListener("click", () => {
  log("Clearing all toasts");
  toaster.clear();
  activeLoader = null;
});

// Native Replacement Override Checkbox
const checkNativeOverride = document.getElementById("check-native-override") as HTMLInputElement;
checkNativeOverride?.addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  log(`Configuring replaceNative: ${target.checked}`);
  toaster.configure({ replaceNative: target.checked });
});

// Native Overrides Verification Actions
const btnNativeAlert = document.getElementById("btn-native-alert") as HTMLButtonElement;
btnNativeAlert?.addEventListener("click", () => {
  log("Invoking window.alert()");
  const result = window.alert("Verify the overridden window.alert design.");
  log(`window.alert() call finished. Return: ${result}`);
});

const btnNativeConfirm = document.getElementById("btn-native-confirm") as HTMLButtonElement;
btnNativeConfirm?.addEventListener("click", async () => {
  log("Invoking window.confirm()");
  const result = window.confirm("Verify the overridden window.confirm design.");
  if (result instanceof Promise) {
    log("Overridden confirm returned a Promise. Awaiting resolution...");
    const val = await result;
    log(`window.confirm() promise resolved: ${val}`, val ? "success" : "error");
  } else {
    log(`window.confirm() returned synchronous: ${result}`, result ? "success" : "error");
  }
});

const btnNativePrompt = document.getElementById("btn-native-prompt") as HTMLButtonElement;
btnNativePrompt?.addEventListener("click", async () => {
  log("Invoking window.prompt()");
  const result = window.prompt("Verify the overridden window.prompt design.", "Antigravity");
  if (result instanceof Promise) {
    log("Overridden prompt returned a Promise. Awaiting resolution...");
    const val = await result;
    log(`window.prompt() promise resolved: ${val === null ? "null" : `"${val}"`}`, val !== null ? "success" : "error");
  } else {
    log(`window.prompt() returned synchronous: ${result === null ? "null" : `"${result}"`}`, result !== null ? "success" : "error");
  }
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
  if (successVal) tokens.success = successVal;
  if (destructiveVal) tokens.destructive = destructiveVal;
  if (warningVal) tokens.warning = warningVal;
  if (infoVal) tokens.info = infoVal;
  if (surfaceVal) tokens.surface = surfaceVal;
  if (textVal) tokens.text = textVal;

  log(`Applying global design token overrides: ${JSON.stringify(tokens)}`);
  toaster.configure({ tokens });
});

const btnResetTokens = document.getElementById("btn-reset-tokens") as HTMLButtonElement;
btnResetTokens?.addEventListener("click", () => {
  // Clear inputs
  ["token-success", "token-destructive", "token-warning", "token-info", "token-surface", "token-text"].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = "";
  });

  log("Resetting global design tokens to system defaults");
  toaster.configure({ tokens: {} });
});
