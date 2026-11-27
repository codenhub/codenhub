import * as fs from "node:fs/promises";

import { splitWords } from "@codenhub/scan";

/* How much of a file is read to tell whether this package or its command wrote it. */
export const HEAD_BYTES = 1024;
/* What every stylesheet the command has written starts with: the package's
   head comment, after Tailwind's banner (`scripts/head.mjs`). The complete
   compiled stylesheets carry it too. From 0.9.0 to 0.11.0 the comment went on
   with the checkbox marks' licences, so an output written then matches. */
export const WRITTEN_HEAD = /^\s*(?:\/\*! tailwindcss [^*]*\*\/\s*)?\/\*! @codenhub\/styles\b/;

/* Content is read as text and never run, as Tailwind reads it: every run of
   characters a class name can hold is a word, and a word counts when it is a
   class this package defines. A word that is not one is read again by its
   parts around each colon, so Svelte's `class:primary={isPrimary}` and a Ruby
   `btn: true` are found. */
export function* findClasses(content: string, known: ReadonlySet<string>): Generator<string, void, undefined> {
  for (const word of splitWords(content, String.raw`\w:-`)) {
    if (known.has(word)) {
      yield word;
    } else if (word.includes(":")) {
      yield* word.split(":").filter((part) => known.has(part));
    }
  }
}

/* A copy of what this package ships, or of what the command wrote, names
   every class it holds, so read as content it kept them all: Django's
   `collectstatic` copies the package's `dist/` into `staticfiles/`, and two
   builds over one folder read each other. A file that starts with the
   package's head is one of them; so is a JSON list of class names holding at
   least half of this version's, as a copy of `purge/classes.json` from this or
   a nearby version does and a safelist does not; so is the generator's table,
   `utilities.json`, from any version, which names every utility; and so is a
   file the same as one this version ships, such as an aesthetic, which
   carries no head. */
export async function isPackageCopy(
  content: string,
  droppable: ReadonlySet<string>,
  shipped: ReadonlyMap<number, readonly string[]>,
): Promise<boolean> {
  if (WRITTEN_HEAD.test(content.slice(0, HEAD_BYTES))) {
    return true;
  }
  if (/^\s*\[/.test(content) && isClassList(content, droppable)) {
    return true;
  }
  if (/^\s*\{\s*"tailwind"\s*:/.test(content) && isUtilityTable(content)) {
    return true;
  }

  for (const file of shipped.get(Buffer.byteLength(content)) ?? []) {
    // oxlint-disable-next-line no-await-in-loop -- rarely more than one file of a size
    if ((await fs.readFile(file, "utf8")) === content) {
      return true;
    }
  }

  return false;
}

// The keys `scripts/build-utilities.mjs` writes.
function isUtilityTable(content: string): boolean {
  let table: unknown;

  try {
    table = JSON.parse(content);
  } catch {
    return false;
  }

  return (
    typeof table === "object" &&
    table !== null &&
    ["variants", "stride", "utilities", "rules"].every((key) => key in table)
  );
}

function isClassList(content: string, droppable: ReadonlySet<string>): boolean {
  let list: unknown;

  try {
    list = JSON.parse(content);
  } catch {
    return false;
  }

  return (
    Array.isArray(list) &&
    list.every((item) => typeof item === "string") &&
    list.filter((item: string) => droppable.has(item)).length >= droppable.size / 2
  );
}
