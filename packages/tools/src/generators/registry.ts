import type { Generator } from "./generator.ts";
import { createLlmsFullGenerator } from "./llms-full-generator.ts";
import { createReadmePackagesGenerator } from "./readme-packages-generator.ts";
import { createStylesRolesGenerator } from "./styles-roles-generator.ts";

/**
 * Every generator `hub generate` runs.
 * @returns Generators in execution order.
 */
export function createGenerators(): Generator[] {
  return [createLlmsFullGenerator(), createReadmePackagesGenerator(), createStylesRolesGenerator()];
}
