/**
 * The comment a complete compiled stylesheet starts with, after Tailwind's
 * banner: `dist/index.css`, `components.css`, `native.css`, and
 * `purge/index.css`, so every stylesheet `chs build` writes from the last. It
 * names the package and its licence, and the command reads it, as
 * `WRITTEN_HEAD` in `src/cli/run.ts`, to replace only an output it wrote and to
 * skip a copy of one of these files in the content it scans. Each of them names
 * every class it holds. From 0.9.0 to 0.11.0 it went on to carry the Lucide
 * and Feather licences of the checkbox marks, which the package now draws
 * itself; an output written then starts with the same words, so the command
 * still replaces it. The theme, the palette, and the aesthetics hold some of
 * the classes and carry no head; the command tells a copy of one by its bytes.
 */

export const HEAD = "/*! @codenhub/styles | Apache-2.0 */";

/** Returns `code` with the head after its leading banner comment. */
export function withHead(code) {
  // Tailwind's own banner stays first; the head goes on the line after it.
  const end = code.startsWith("/*!") ? code.indexOf("*/") + 2 : 0;

  return end ? `${code.slice(0, end)}\n${HEAD}${code.slice(end)}` : `${HEAD}\n${code}`;
}
