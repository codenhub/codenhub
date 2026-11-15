/**
 * Minifies a stylesheet the way `optimize` in `@tailwindcss/node` 4.3.4 does,
 * so the compiled entrypoints equal what Tailwind writes for `/tw`, byte for
 * byte: the same Lightning CSS options, applied twice, because a second pass
 * still merges rules the first one produced, then `@media not (` spelled
 * `@media not all and (` for Safari before 16.4, which reads the short form
 * as matching nothing.
 *
 * `lightningcss` is pinned to the release `@tailwindcss/node` resolves, in the
 * workspace catalog: a minor release can change how a rule minifies.
 *
 * Unlike Tailwind's, a warning fails the build: Lightning CSS warns where it
 * dropped what it could not parse, and this package writes its own source.
 */
import { Features, transform } from "lightningcss";

const OPTIONS = {
  minify: true,
  drafts: { customMedia: true },
  nonStandard: { deepSelectorCombinator: true },
  include: Features.Nesting | Features.MediaQueries,
  exclude: Features.LogicalProperties | Features.DirSelector | Features.LightDark,
  targets: { safari: (16 << 16) | (4 << 8), ios_saf: (16 << 16) | (4 << 8), firefox: 128 << 16, chrome: 111 << 16 },
  errorRecovery: true,
};

function pass(code, filename) {
  const result = transform({ ...OPTIONS, filename, code: Buffer.from(code) });

  if (result.warnings.length > 0) {
    const [first] = result.warnings;
    throw new Error(`${filename}:${first.loc.line}:${first.loc.column}: ${first.message}`);
  }

  return result.code.toString();
}

export function minify(css, filename) {
  return pass(pass(css, filename), filename).replaceAll("@media not (", "@media not all and (");
}
