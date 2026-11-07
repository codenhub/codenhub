---
status: IMPLEMENTED
last_updated: 2026-11-07
scope: Translations of package READMEs and public package documentation.
---

# Package translations spec

This document defines how a package translates its README and public documentation, how translations are kept in step with the English they translate, and how they are published. English is the source language: every other language is a translation of an English document, and `docs/specs/packages-documentation.md` and `docs/specs/packages-readme.md` keep governing the English.

## Why

CodenHub is meant to be found and used by people who do not read English, and an English-only package is a harder sell to them. The main site's interface is already translated, but its package pages and the documentation site lead to READMEs and docs that were English only.

Translation is optional per package and per document. A package with no translations stays fully compliant.

## Languages

The supported translation locales are:

- `pt-BR`: Português (Brasil).
- `es`: Español.

Supporting another locale means adding it to this list, in the change that adds that support.

A locale is written as a BCP 47 tag, with a region in upper case when it has one, such as `pt-BR`. This is the same spelling as the URL prefix both sites use.

## Writing a translation

A translation carries what the English says into another language. It does not reproduce the English words. A reader of the translation MUST come away understanding the same thing as a reader of the English: the same facts, the same meaning, the same tone, and the same way of explaining. Running the English through a translation tool and pasting the result does not meet this. Tools MAY help draft a translation, but someone who writes the language checks every sentence against what the English means.

Adaptation is encouraged wherever a literal rendering would change or obscure the meaning:

- Rephrase idioms, wordplay, and figures of speech into ones that work in the language, or say the fact plainly. Keep the English's tone: a light sentence stays light, and a warning stays a warning.
- Use the words a developer in that language actually uses. When the community keeps a technical term in English, keep it. When a term has an established translation, use that.
- Restructure sentences and paragraphs to read naturally in the language, as long as no fact, step, condition, or caveat is lost, added, or weakened.
- Adapt examples to the language and its readers, such as names and sample text, when that makes them clearer. Code stays valid and behaves the same.

The meaning cannot be adapted. A translation MUST NOT drop or add facts, soften or harden a requirement, or document behavior the English does not. When the English is wrong or unclear, fix the English first and translate the fix.

Some words cannot be adapted. Identifiers, API names, option names, error codes, file paths, commands, and anything else a reader types or searches for stay as written, in prose as well as in code.

## Location

A translation lives inside the package it translates, beside the English:

```text
packages/<pkg>/
  README.md
  README.pt-BR.md
  docs/
    index.md
    getting-started.md
    guides/
      setup.md
    pt-BR/
      index.md
      getting-started.md
      guides/
        setup.md
```

- A translated public document lives at `docs/<locale>/<path>`, where `docs/<path>` is the English document it translates.
- A translated README lives at `README.<locale>.md`, beside `README.md`. The README is at the package root so its relative links keep the same shape as the English one's, and `README.<locale>.md` is the name GitHub readers look for.
- `docs/<locale>/` is not a documentation area of its own: it is reserved for translations, and every file in it MUST have an English counterpart at the mirrored path. That includes assets: a localized image, such as a screenshot with translated labels, replaces the English one at the same path, so the translated page links it in the same shape as the English page links the original.

Translating is per document. Any subset of a package's public documents MAY be translated; an untranslated document is read in English.

Rejected: a repository-wide `translations/<locale>/<pkg>/` tree. It would publish on merge rather than on release, ahead of the English and the release it describes, and it would split a package's documentation across two places, so the package would no longer carry everything it publishes.

## What is translated

- The README and hand-authored public documents under `docs/`, outside `docs/internal/`.

What is not translated:

- A generated `docs/reference/` area (`docs/specs/packages-reference.md`). It is compiled from TSDoc in English and regenerated with the code, so a hand-written translation would go stale on every API change. `docs/<locale>/reference/` is invalid. Its fixed labels, the words the generator writes on every page (section headings such as "Functions", and leads such as "Parameters" and "Returns"), are not part of the package: they are named in one list (`REFERENCE_LABELS` in `packages/tools/src/documentation/reference-labels.ts`), and the documentation site translates them as interface text. TSDoc prose stays English. A per-symbol translation of the prose, checked for drift like a document, is deferred until a package needs it.
- `docs/changelog/` (`docs/specs/packages-changelog.md`). A version page records a release once and is not maintained afterwards, so translating it buys little. `docs/<locale>/changelog/` is invalid.
- `docs/internal/`, which is for maintainers and is never published, so a translation of it would never reach a reader. `docs/<locale>/internal/` is invalid.
- `llms.txt` and `llms-full.txt`. Their readers are language models, which read English, and a second compilation per locale would double what each publish has to keep current. `llms-full.txt` MUST exclude every `docs/<locale>/` area.
- Source code, TSDoc, and code inside fenced blocks. Comments inside a code example MAY be translated.

## Translated documents

A translated public document follows the same rules as its English counterpart: the frontmatter schema, exactly one H1, and the writing guidance in `docs/guidelines/public-docs-writing.md`. Its `title`, `description`, and `group` are translated. Its `order` and `curated` MUST match the English document's, so a locale cannot reorder or reshape what the English publishes. Its headings MUST match the English document's in number and level, in the same order, so each section has one counterpart in every language (see "Section links").

Its frontmatter also MUST carry `source`, a field valid only on a document under `docs/<locale>/`:

```yaml
---
title: Primeiros passos
source: 3f9c2a1d8e7b6c5a4f3e2d1c0b9a8f7e6d5c4b3a
---
```

`source` is the git blob ID of the English document the translation was made from, as `git hash-object docs/getting-started.md` prints it. Git computes it from the committed form of the file, so line-ending conversion does not change it.

A translated README cannot carry frontmatter, since GitHub and npm would render it as a table. It records the same value in an HTML comment on its first line instead:

```md
<!-- source: 3f9c2a1d8e7b6c5a4f3e2d1c0b9a8f7e6d5c4b3a -->

# @codenhub/error
```

### Links

A link in a translation MUST resolve on disk, like any other local link, so a translation reads correctly on GitHub and in the npm tarball as well as on the documentation site. It links to the translated document when one exists, and to the English document otherwise: `docs/pt-BR/getting-started.md` links an untranslated page as `../guides/setup.md`, and a translated one as `./guides/setup.md`.

A link from a translation to an English document that has a translation in the same locale is reported, so that translating a page later also redirects the links to it.

Rejected: writing links in a translation exactly as in the English and resolving them per locale at publish time. A link to an untranslated page would then be broken everywhere except the documentation site.

## Drift

A translation is current when its `source` equals the blob ID of the English document it translates. Any change to the English, including a typo fix or reformatting, makes it stale, because a tool cannot tell a cosmetic change from a changed fact. Updating it starts from what changed:

```sh
git diff <source> <blob ID of the current English>
```

Both IDs are blobs git already has, so this prints the English changes since the translation was made, however many commits and releases ago that was.

A stale translation MUST NOT be published. It does not have to be fixed in the change that edits the English:

- `hub check` reports a stale translation as a warning. A change to an English page can merge, and its translation can follow in another change.
- `hub release` reports a stale translation as a blocker, and `hub publish` refuses to publish a package that has one. A release is where a translation reaches readers, so it is where staleness stops.

The documentation site therefore never needs to show a stale translation, and has no rule for doing so.

Rejected:

- Blocking every change that edits a translated English page until its translation is updated. Nothing would go stale even on `main`, but every documentation change, including a one-word fix, would need someone who writes the language, and the release gate already keeps stale translations from readers.
- Recording the package version a translation was made from instead of a blob ID. A release that does not touch a page would mark its translation stale, and a version does not say which lines changed.
- Publishing a stale translation with an "outdated" notice, or falling back to English for it. Both accept that a stale translation reaches a release; the gate above prevents that.

## Publishing

Translations ship on the same schedule as the English: in the package tarball and from the package's release tag. A translation added to an already released package is published with that package's next release.

- Package tarballs MUST include `README.<locale>.md` files and `docs/<locale>/`. Neither needs a `files` entry: npm includes every `README.*` file at the package root (checked with npm 11.12), and public `docs/` already includes `docs/<locale>/`.
- The release-tag snapshot both sites read (`docs/ci.md`, "Publish-scoped content") MUST keep `README.<locale>.md` and `docs/<locale>/`.

### Documentation site

The documentation site follows the main site's URL scheme (`apps/www/src/i18n/index.ts`): English at the root, and each other locale under its own prefix.

- English: `https://docs.codenhub.dev/<slug>/<path>/`.
- A translation: `https://docs.codenhub.dev/<locale>/<slug>/<path>/`, its Markdown at `index.md` inside that route, as `docs/specs/packages-documentation.md` defines for English pages.

Every published page, reference and changelog included, has a route in every locale, so a reader who chose a language keeps it on every page they open. The site's interface is translated for every supported locale, down to copy feedback, link previews and code-block controls; a missing path under a locale gets that locale's not-found page. A page without a translation in a locale shows its English body in that locale's interface, under a notice that it is not translated yet, with the body marked `lang="en"`. Such a page MUST name the English page as its canonical URL, MUST NOT name alternates, and is left out of the sitemap, so search engines index the English page once. Inside a locale the navigation marks each untranslated page as English. Each translated page and its English counterpart MUST name each other as alternates (`hreflang`), so a search engine shows the reader's language. Each also MUST name the English page as the `x-default` alternate: a reader whose language the site does not offer gets the English, which is complete and is what every translation is checked against, rather than whichever translation a search engine picks.

The locale is the outermost path segment so that the version segment (`docs/specs/packages-docs-versions.md`, "URLs") goes inside the package route without moving any locale URL.

Rejected: a locale route only for a translated document, linking each untranslated page to its English route. A reader who opened an untranslated page, which every reference and changelog page is, landed on the English site and stayed there: the section links, the language menu and the next page they opened were all English, and the interface around the page changed language under them. It was chosen to avoid serving the same content at two URLs and to let the URL say whether a page is a translation; the canonical link answers the first and the notice the second.

### Section links

A heading's id comes from its text, in a translation as in English, so it matches the id GitHub gives the same heading and a link within a translation resolves on GitHub, in the npm tarball, and on the site alike. An English section link therefore names no element on the translated page. Such a link reaches a translated page whenever the locale redirect (see "Language choice") keeps the fragment of an English deep link.

A translated page on the documentation site moves an English section link to the translated section: the build pairs each English heading id with the translated heading at the same position, which the matching heading structure (see "Translated documents") makes exact, and the page swaps an English fragment it has no element for with the paired id as it loads. A page whose structure does not match pairs nothing, rather than send a reader to the wrong section.

Rejected:

- English ids on translated headings. Translations would need explicit heading ids, which GitHub does not support: the id syntax would render as text there, or every link within a translation would break outside the site.
- Leaving an English section link at the top of the translated page. The reader still gets the right page in their language, but the link was to a section and a shared section link is a common way into documentation.

Deferred: the locale redirect rewriting the fragment itself, through a fragment map passed to it. On the documentation site it would repeat what the translated page already does, and the main site's README pages have no heading ids to map. It is worth adding once a site that uses the redirect has section ids and no page script of its own.

The site's search index is built per locale and covers what each locale's navigation lists, untranslated pages included, at their locale routes.

### Language choice

A visitor's language choice is shared by every CodenHub site. The language menu saves it in the `codenhub-locale` cookie, scoped to `codenhub.dev` so it reaches `docs.codenhub.dev` too (`packages/app-shell/src/locales.ts`). An English page on either site, opened from outside CodenHub, sends the visitor to the same page in the saved language, or, without a saved choice, in the first of the browser's languages the site offers. Where cookies are blocked it does not guess from the browser's languages, since no choice of English could be saved. Navigation between CodenHub pages never redirects, so choosing English in the menu sticks. The main site links a package's documentation, changelog and search in the page's locale.

Rejected: `localStorage`, which each origin keeps to itself, so a choice made on one site was unknown to the other.

### Main site

The main site's package page in a locale shows `README.<locale>.md` when the release carries one, and `README.md` otherwise.

## Validation

`pnpm check` enforces this spec through a `translation` rule. It reports as errors:

- A file under `docs/<locale>/` with no English counterpart at the mirrored path, or a `README.<locale>.md` beside no `README.md`.
- A `docs/<locale>/` or `README.<locale>.md` for a locale not listed under "Languages".
- A `docs/<locale>/reference/`, `docs/<locale>/changelog/`, or `docs/<locale>/internal/` area.
- A translation whose `source` is missing or is not a 40-character hexadecimal blob ID.
- A translated document whose `order` or `curated` differs from its English counterpart's.
- A translated document whose headings differ from its English counterpart's in number or in level at any position.

It reports as warnings:

- A stale translation, which `hub release` and `hub publish` treat as a blocker (see "Drift").
- A link from a translation to an English document that has a translation in the same locale.

Translations are also validation surfaces for the link checks in `docs/specs/packages-documentation.md`, with the same requirements as the English.

## Exceptions

`docs/guidelines/documentation.md` defines exception requirements; `docs/specs/packages-exceptions.md` owns package-specific exceptions and compliance-check waivers.
