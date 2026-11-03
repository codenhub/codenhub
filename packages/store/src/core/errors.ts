import type { StoreErrorEvent } from "./types";

type OperationResult<T> = { ok: true; value: T } | { ok: false; cause: unknown };

/** @internal */
export function capture<T>(operation: () => T): OperationResult<T> {
  try {
    return { ok: true, value: operation() };
  } catch (cause) {
    return { ok: false, cause };
  }
}

/** @internal */
export async function captureAsync<T>(operation: () => Promise<T>): Promise<OperationResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (cause) {
    return { ok: false, cause };
  }
}

/** @internal */
export function failureEvent(code: StoreErrorEvent["code"], storageKey: string, cause?: unknown): StoreErrorEvent {
  let message: string;
  if (code === "store.parse_failed") {
    message = `Failed to parse stored JSON for key "${storageKey}".`;
  } else if (code === "store.validation_failed") {
    message = `Stored value for key "${storageKey}" failed schema validation.`;
  } else if (code === "store.clear_unsupported") {
    message = `Driver does not support clearing storage for key "${storageKey}".`;
  } else {
    const operation =
      code === "store.read_failed" ? "read value" : code === "store.write_failed" ? "write value" : "clear storage";
    message = `Driver failed to ${operation} for key "${storageKey}".`;
  }
  return { code, message, storageKey, ...(cause === undefined ? {} : { cause }) };
}
