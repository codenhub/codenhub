import type { Generator } from "./generator.ts";
import { createIconDataGenerator } from "./icon-data-generator.ts";
import { createLlmsFullGenerator } from "./llms-full-generator.ts";
import { createReadmePackagesGenerator } from "./readme-packages-generator.ts";
import { createReferenceGenerator } from "./reference-generator.ts";

/**
 * Every workspace-generic generator `hub generate` runs in-process.
 *
 * A generator specific to one package, such as `@codenhub/styles`' palette,
 * is that package's own `generate` script instead -- `hub generate` runs it
 * the same way it runs any other package script, alongside these.
 * @returns Generators in execution order.
 */
export function createGenerators(): Generator[] {
  return [
    createIconDataGenerator(),
    createLlmsFullGenerator(),
    createReadmePackagesGenerator(),
    createReferenceGenerator(),
  ];
}
