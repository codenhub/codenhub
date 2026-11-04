import { describe, expect, it } from "vitest";

import { isTranslationLocale, parseTranslationPath, translatedPathOf } from "./translation-paths.ts";

describe("translation paths", () => {
  it("recognizes a translated README and the README it translates", () => {
    expect(parseTranslationPath("README.pt-BR.md")).toEqual({
      englishPath: "README.md",
      kind: "readme",
      locale: "pt-BR",
    });
  });

  it("recognizes a file under a locale area and its mirrored English path", () => {
    expect(parseTranslationPath("docs/es/guides/setup.md")).toEqual({
      englishPath: "docs/guides/setup.md",
      kind: "document",
      locale: "es",
    });
  });

  it("recognizes an unlisted locale so it can be reported", () => {
    expect(parseTranslationPath("docs/fr/index.md")?.locale).toBe("fr");
    expect(parseTranslationPath("README.pt-br.md")?.locale).toBe("pt-br");
    expect(isTranslationLocale("pt-br")).toBe(false);
  });

  it("leaves ordinary documentation areas and files alone", () => {
    expect(parseTranslationPath("docs/api/index.md")).toBeUndefined();
    expect(parseTranslationPath("docs/guides/index.md")).toBeUndefined();
    expect(parseTranslationPath("docs/es.md")).toBeUndefined();
    expect(parseTranslationPath("README.md")).toBeUndefined();
    expect(parseTranslationPath("README.draft-notes.md")).toBeUndefined();
  });

  it("mirrors an English path into a locale", () => {
    expect(translatedPathOf("README.md", "es")).toBe("README.es.md");
    expect(translatedPathOf("docs/guides/setup.md", "pt-BR")).toBe("docs/pt-BR/guides/setup.md");
    expect(translatedPathOf("docs/es/index.md", "pt-BR")).toBeUndefined();
    expect(translatedPathOf("LICENSE", "es")).toBeUndefined();
  });
});
