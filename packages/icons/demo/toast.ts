const TOAST_DURATION = 2000;

let hideTimeout: number | undefined;

/**
 * Shows a short confirmation message in the corner of the demo.
 *
 * @param message - Text to show.
 */
export function showToast(message: string): void {
  let toast = document.getElementById("demo-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "demo-toast";
    toast.className = "demo-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("open");

  window.clearTimeout(hideTimeout);
  hideTimeout = window.setTimeout(() => toast?.classList.remove("open"), TOAST_DURATION);
}
