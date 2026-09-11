import { describe, expect, it } from "vitest";

import { buildReferenceModel } from "./reference-model.ts";

function textPart(text: string) {
  return { kind: "text", text };
}

const browserRegistryVariable = {
  id: 900,
  name: "browserErrorRegistry",
  variant: "declaration",
  kind: 32,
  flags: {},
  comment: { summary: [textPart("Frozen browser error registry.")] },
  sources: [{ fileName: "./packages/error/src/registries/browser.ts", line: 3 }],
};

const project = {
  schemaVersion: "2.0",
  id: 0,
  name: "@codenhub/error",
  variant: "project",
  kind: 1,
  flags: {},
  children: [
    {
      id: 1,
      name: "index",
      variant: "declaration",
      kind: 2,
      flags: {},
      comment: {
        summary: [textPart("Typed error normalization\nand result helpers.")],
        blockTags: [{ tag: "@since", content: [textPart("1.0.0")] }],
      },
      children: [
        {
          id: 10,
          name: "createAppError",
          variant: "declaration",
          kind: 64,
          flags: {},
          sources: [{ fileName: "./packages/error/src/create-app-error.ts", line: 42 }],
          signatures: [
            {
              id: 11,
              name: "createAppError",
              variant: "signature",
              kind: 4096,
              flags: {},
              comment: {
                summary: [textPart("Builds a frozen "), { kind: "code", text: "`AppError`" }, textPart(".")],
                blockTags: [
                  // TypeDoc leaves an unmatched @param as a blockTag; "options" has
                  // no parameter of its own below, so this is the fallback path.
                  { tag: "@param", name: "options", content: [textPart("Normalization options.")] },
                  { tag: "@returns", content: [textPart("A frozen error.")] },
                  { tag: "@throws", content: [textPart("When the registry is missing.")] },
                  { tag: "@throws", content: [textPart("When maxDepth is negative.")] },
                  { tag: "@since", content: [textPart("1.2.0")] },
                  { tag: "@deprecated", content: [textPart("Use createError instead.")] },
                ],
              },
              // A matched @param/@typeParam is resolved onto the parameter's own
              // comment by TypeDoc, not left as a blockTag on the signature.
              parameters: [
                {
                  id: 12,
                  name: "message",
                  variant: "param",
                  kind: 32768,
                  flags: {},
                  comment: { summary: [textPart("Human-readable message.")] },
                },
                // No comment of its own: its doc must come from the "@param options"
                // blockTag above, since it is undocumented on the reflection itself.
                { id: 14, name: "options", variant: "param", kind: 32768, flags: {} },
              ],
              typeParameters: [
                {
                  id: 13,
                  name: "T",
                  variant: "typeParam",
                  kind: 131072,
                  flags: {},
                  comment: { summary: [textPart("Source union.")] },
                },
              ],
            },
          ],
        },
        {
          id: 20,
          name: "AppError",
          variant: "declaration",
          kind: 256,
          flags: {},
          comment: { summary: [textPart("Normalized application error.")] },
          sources: [{ fileName: "./packages/error/src/types.ts", line: 8 }],
          children: [
            {
              id: 21,
              name: "message",
              kind: 1024,
              flags: { isExternal: true, isInherited: true },
              inheritedFrom: { type: "reference", name: "Error.message" },
            },
            {
              id: 22,
              name: "messageKey",
              kind: 1024,
              flags: { isReadonly: true, isOptional: true },
              comment: { summary: [textPart("Translation key.")] },
            },
            {
              id: 23,
              name: "isRetryable",
              kind: 1024,
              flags: { isReadonly: true, isInherited: true },
              inheritedFrom: { type: "reference", name: "BaseError.isRetryable" },
              comment: { summary: [textPart("Whether a retry may succeed.")] },
            },
          ],
        },
        {
          id: 30,
          name: "Result",
          variant: "declaration",
          kind: 2097152,
          flags: {},
          comment: { summary: [textPart("Success or failure.")] },
          sources: [{ fileName: "./packages/error/src/result.ts", line: 28 }],
        },
        {
          id: 40,
          name: "DEFAULT_APP_ERROR_MESSAGE",
          variant: "declaration",
          kind: 32,
          flags: {},
          comment: {
            summary: [textPart("Fallback message.")],
            blockTags: [{ tag: "@defaultValue", content: [{ kind: "code", text: '`"Something went wrong"`' }] }],
          },
          sources: [{ fileName: "./packages/error/src/normalize.ts", line: 5 }],
        },
      ],
    },
    {
      id: 2,
      name: "registries",
      variant: "declaration",
      kind: 2,
      flags: {},
      children: [
        {
          id: 800,
          name: "browserErrorRegistry",
          variant: "reference",
          kind: 4194304,
          flags: {},
          sources: [{ fileName: "./packages/error/src/registries/index.ts", line: 1 }],
          target: 900,
        },
      ],
    },
    {
      id: 3,
      name: "registries/browser",
      variant: "declaration",
      kind: 2,
      flags: {},
      children: [browserRegistryVariable],
    },
  ],
};

const subpaths = { index: ".", registries: "./registries", "registries/browser": "./registries/browser" };

describe("buildReferenceModel", () => {
  it("groups symbols by kind order, then alphabetically", () => {
    const model = buildReferenceModel(project, subpaths);
    const index = model.entrypoints.find((entry) => entry.subpath === ".");

    expect(model.packageName).toBe("@codenhub/error");
    expect(index?.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual([
      "function:createAppError",
      "interface:AppError",
      "type-alias:Result",
      "variable:DEFAULT_APP_ERROR_MESSAGE",
    ]);
  });

  it("reads parameter, type-parameter, returns, throws, and deprecation tags", () => {
    const model = buildReferenceModel(project, subpaths);
    const fn = model.entrypoints[0]?.symbols.find((symbol) => symbol.name === "createAppError");

    // "message" is documented on the parameter's own comment (the real TypeDoc
    // shape for a matched tag); "options" falls back to the parent's blockTag.
    expect(fn?.parameters).toEqual([
      { name: "message", doc: "Human-readable message." },
      { name: "options", doc: "Normalization options." },
    ]);
    expect(fn?.typeParameters).toEqual([{ name: "T", doc: "Source union." }]);
    expect(fn?.returns).toBe("A frozen error.");
    expect(fn?.throws).toEqual(["When the registry is missing.", "When maxDepth is negative."]);
    expect(fn?.deprecated).toBe("Use createError instead.");
    expect(fn?.since).toBe("1.2.0");
    expect(fn?.doc).toBe("Builds a frozen `AppError`.");
    expect(fn?.source).toEqual({ fileName: "packages/error/src/create-app-error.ts", line: 42 });
  });

  it("reads the entry module's summary and @since as the entrypoint description and version", () => {
    const model = buildReferenceModel(project, subpaths);
    const index = model.entrypoints.find((entry) => entry.subpath === ".");
    const registries = model.entrypoints.find((entry) => entry.subpath === "./registries");

    expect(index?.description).toBe("Typed error normalization and result helpers.");
    expect(index?.since).toBe("1.0.0");
    expect(registries?.description).toBeUndefined();
    expect(registries?.since).toBeUndefined();
  });

  it("drops externally inherited members, keeps in-package inherited ones as a bare reference, and keeps own ones", () => {
    const model = buildReferenceModel(project, subpaths);
    const iface = model.entrypoints[0]?.symbols.find((symbol) => symbol.name === "AppError");

    expect(iface?.members).toEqual([
      {
        name: "isRetryable",
        kind: "property",
        isOptional: false,
        isReadonly: true,
        isStatic: false,
        inheritedFrom: "BaseError",
        parameters: [],
      },
      {
        name: "messageKey",
        kind: "property",
        isOptional: true,
        isReadonly: true,
        isStatic: false,
        doc: "Translation key.",
        deprecated: undefined,
        parameters: [],
      },
    ]);
  });

  it("reads @defaultValue for a variable", () => {
    const model = buildReferenceModel(project, subpaths);
    const variable = model.entrypoints[0]?.symbols.find((symbol) => symbol.name === "DEFAULT_APP_ERROR_MESSAGE");

    expect(variable?.defaultValue).toBe('`"Something went wrong"`');
  });

  it("resolves a re-export to its target declaration and records its source", () => {
    const model = buildReferenceModel(project, subpaths);
    const reexport = model.entrypoints
      .find((entry) => entry.subpath === "./registries")
      ?.symbols.find((symbol) => symbol.name === "browserErrorRegistry");

    expect(reexport?.kind).toBe("variable");
    expect(reexport?.doc).toBe("Frozen browser error registry.");
    expect(reexport?.reexportedFrom).toBe("packages/error/src/registries/browser.ts");
  });

  it("emits entrypoints in the order their subpaths were supplied", () => {
    const model = buildReferenceModel(project, subpaths);
    expect(model.entrypoints.map((entry) => entry.subpath)).toEqual([".", "./registries", "./registries/browser"]);
  });

  it("throws on a non-object project", () => {
    expect(() => buildReferenceModel(null, {})).toThrow(/expected an object/);
  });
});
