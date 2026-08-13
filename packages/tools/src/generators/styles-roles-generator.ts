import { loadStyleRegistry, STYLES_LOCATION } from "../styles/registry.ts";
import { renderIntentCss, renderMembershipCss } from "../styles/roles-css.ts";
import type { Generator } from "./generator.ts";

const STYLES_PACKAGE = "@codenhub/styles";

/**
 * Creates the generator that derives the styles package's role membership from
 * its registry.
 *
 * The registry decides what the package supports, so the selector lists that
 * follow from it are generated rather than maintained: a component joins a role
 * by editing one line of JSON, and the intent reset, the role membership, and
 * the role variants cannot disagree about the result.
 * @returns Generator ready for registration.
 */
export function createStylesRolesGenerator(): Generator {
  return {
    generate: async ({ packages, workspace }) => {
      if (!packages.some(({ name }) => name === STYLES_PACKAGE)) {
        return [];
      }
      const registry = await loadStyleRegistry(workspace.root);
      if (registry === undefined) {
        return [];
      }
      return [
        { contents: renderIntentCss(registry), path: `${STYLES_LOCATION}/src/intent.css` },
        { contents: renderMembershipCss(registry, "class"), path: `${STYLES_LOCATION}/src/roles/membership.css` },
        { contents: renderMembershipCss(registry, "native"), path: `${STYLES_LOCATION}/src/roles/native.css` },
      ];
    },
    name: "styles-roles",
    summary: "Derive the styles package's intent classes and role membership from registry.json.",
  };
}
