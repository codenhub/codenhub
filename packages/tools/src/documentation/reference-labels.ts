/**
 * The fixed English text a generated reference page carries around what TSDoc
 * supplies: its group headings, the labels that lead each prose block, and
 * the sentences the generator writes. A publishing site translates these, and
 * only these, on a page shown under a locale
 * (`docs/specs/packages-translations.md`, "What is translated"), so every
 * label the generator writes MUST come from here.
 */
export const REFERENCE_LABELS = {
  functions: "Functions",
  classes: "Classes",
  interfaces: "Interfaces",
  typeAliases: "Type aliases",
  enumerations: "Enumerations",
  variables: "Variables",
  namespaces: "Namespaces",
  internalTypes: "Internal types",
  parameters: "Parameters",
  typeParameters: "Type parameters",
  returns: "Returns",
  throws: "Throws",
  default: "Default",
  since: "Since",
  example: "Example",
  seeAlso: "See also",
  deprecated: "Deprecated.",
  inheritedFrom: "Inherited from",
  alsoExportedAs: "Also exported as",
  notExportedDeclaredIn: "Not exported; declared in",
} as const;

export type ReferenceLabel = keyof typeof REFERENCE_LABELS;

/** Labels that head a symbol group as an H2. */
export const REFERENCE_GROUP_LABELS = [
  "functions",
  "classes",
  "interfaces",
  "typeAliases",
  "enumerations",
  "variables",
  "namespaces",
  "internalTypes",
] as const satisfies readonly ReferenceLabel[];

/** Labels written in bold at the start of a paragraph. */
export const REFERENCE_LEAD_LABELS = [
  "parameters",
  "typeParameters",
  "returns",
  "throws",
  "default",
  "since",
  "example",
  "seeAlso",
  "deprecated",
] as const satisfies readonly ReferenceLabel[];

/** Labels that open a sentence the generator writes, followed by a space. */
export const REFERENCE_SENTENCE_LABELS = [
  "inheritedFrom",
  "alsoExportedAs",
  "notExportedDeclaredIn",
] as const satisfies readonly ReferenceLabel[];
