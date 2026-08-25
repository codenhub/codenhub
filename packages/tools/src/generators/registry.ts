import type { Generator } from "./generator.ts";
import { createIconDataGenerator } from "./icon-data-generator.ts";
import { createLlmsFullGenerator } from "./llms-full-generator.ts";
import { createReadmePackagesGenerator } from "./readme-packages-generator.ts";

/**
 * Every generator `hub generate` runs.
 * @returns Generators in execution order.
 */
export function createGenerators(): Generator[] {
  return [createIconDataGenerator(), createLlmsFullGenerator(), createReadmePackagesGenerator()];
}
