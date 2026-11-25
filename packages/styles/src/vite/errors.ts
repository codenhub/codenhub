// Every message starts with the entry point, so a reader of Vite's output knows which plugin stopped the build.
export function pluginError(message: string, cause?: unknown): Error {
  return new Error(`@codenhub/styles/vite: ${message}`, cause === undefined ? undefined : { cause });
}

interface CannotRead {
  file: string;
  error: unknown;
  // What makes the plugin stop reading the file, when its permissions cannot change.
  remedy: string;
}

// Node.js's code says why, such as EACCES or EMFILE, without the paths its message repeats.
export function cannotRead({ file, error, remedy }: CannotRead): Error {
  const { code } = error as { code?: unknown };

  return pluginError(
    `cannot read "${file}"${typeof code === "string" ? ` (${code})` : ""}; fix its permissions or ${remedy}.`,
    error,
  );
}
