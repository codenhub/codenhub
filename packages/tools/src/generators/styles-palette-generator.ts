import { execute } from "../process/execute.ts";
import type { GeneratedFile, Generator } from "./generator.ts";

const STYLES_PACKAGE = "@codenhub/styles";
const SCRIPT_RELATIVE_PATH = "scripts/generate-palette.mjs";
const PALETTE_RELATIVE_PATH = "src/palette.css";
/* The script drives a real headless browser (see its own doc comment for why
   -- reimplementing `color-mix(in oklab, ...)` by hand is exactly the
   hand-retyping `docs/internal/generated-palette.md` exists to avoid), which
   is slower than every other generator here. */
const TIMEOUT_MS = 120_000;

/**
 * Creates the generator that rebuilds `@codenhub/styles`' `./palette` export
 * source from its own `registry.json` and `theme.css`.
 *
 * The computation itself lives in `packages/styles/scripts/generate-
 * palette.mjs`, run here rather than reimplemented in this package: it needs
 * the real Tailwind CLI and a real browser to read real composed values,
 * both of which are `@codenhub/styles`' own devDependencies, not this
 * package's.
 * @returns Generator ready for registration.
 */
export function createStylesPaletteGenerator(): Generator {
  return {
    generate: async ({ packages }) => {
      const stylesPackage = packages.find(({ name }) => name === STYLES_PACKAGE);
      if (!stylesPackage) {
        return [];
      }

      const outcome = await execute(
        { args: [SCRIPT_RELATIVE_PATH], command: process.execPath, cwd: stylesPackage.directory },
        { stdio: "pipe", timeoutMs: TIMEOUT_MS },
      );

      if (!outcome.isSuccess) {
        throw new Error(
          `${SCRIPT_RELATIVE_PATH} failed in ${stylesPackage.location}${outcome.didTimeOut ? " (timed out)" : ""}:\n${outcome.output ?? ""}`,
        );
      }

      return [
        { contents: outcome.stdout ?? "", path: `${stylesPackage.location}/${PALETTE_RELATIVE_PATH}` },
      ] satisfies GeneratedFile[];
    },
    name: "styles-palette",
    summary: "Rebuild @codenhub/styles' generated ./palette export from registry.json and theme.css.",
  };
}
