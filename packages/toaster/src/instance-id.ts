let instanceCounter = 0;

/** A page-unique id for a toaster or dialogs instance, written to `data-toast-instance`. */
export function generateInstanceId(): string {
  const randomId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `coden-toast-${randomId}-${++instanceCounter}`;
}
