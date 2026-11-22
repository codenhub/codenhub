/**
 * This package's `generate` script: the language list first, since the
 * palette compiles the stylesheets that hold it. Each reads `--dry-run` from
 * the command line and sets the exit code itself.
 */
await import("./generate-script-languages.mjs");
await import("./generate-palette.mjs");
