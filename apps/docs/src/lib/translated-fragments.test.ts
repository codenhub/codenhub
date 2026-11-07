import { describe, expect, it } from "vitest";

import { translatedFragments } from "./translated-fragments";

const heading = (depth: number, slug: string) => ({ depth, slug, text: slug });

describe("translatedFragments", () => {
  it("pairs each English heading id with the translated heading at the same position", () => {
    const english = [heading(1, "recipes"), heading(2, "classify-http-responses"), heading(3, "retry")];
    const translated = [heading(1, "recetas"), heading(2, "clasificar-respuestas-http"), heading(3, "retry")];

    expect(translatedFragments(english, translated)).toEqual({
      "classify-http-responses": "clasificar-respuestas-http",
      recipes: "recetas",
    });
  });

  it("maps nothing when the heading structures differ, rather than guess a section", () => {
    const english = [heading(1, "recipes"), heading(2, "install"), heading(2, "use")];

    expect(translatedFragments(english, [heading(1, "recetas"), heading(2, "instalar")])).toEqual({});
    expect(translatedFragments(english, [heading(1, "recetas"), heading(2, "instalar"), heading(3, "usar")])).toEqual(
      {},
    );
  });
});
