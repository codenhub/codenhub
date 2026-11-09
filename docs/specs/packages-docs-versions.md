---
status: APPROVED
last_updated: 2026-11-09
scope: Documentation for past package versions on the documentation site.
---

# Documentation versions spec

This document defines which past versions of a package the documentation site keeps, where they are served, and how the site treats them. It extends `docs/specs/packages-documentation.md`, which keeps governing the current version, and the release-tag snapshot in `docs/ci.md`, "Publish-scoped content", which is where every version's content comes from.

## Why

A consumer pinned to an older major had no way to read its documentation except opening the files in `node_modules`: the site showed only the newest stable release. Keeping every release would bury the ones people use under many that nobody installed — most 0.x minors in this repository were released to try a package out in the maintainers' own projects, then replaced by a patch the maintainers found themselves. So the site keeps a small set chosen by rule, plus what each package lists on purpose.

## Kept versions

The **current version** is the package's newest stable release, as `docs/ci.md`, "Publish-scoped content", resolves it. The site keeps it as it does today.

The **archived versions** are, apart from the current version:

- The newest stable release of each major from 1.0, other than the current version's major.
- For each entry in `codenhub.docs.versions`, the newest stable release that satisfies it, if that is not the current version.

A pre-release is never kept, for the reason the current version skips it: the site documents what `npm install` resolves.

Before 1.0 nothing is archived by rule. A 0.minor is not treated as a line of its own, because most of them never had a consumer; a 0.x version stays only when a package lists it.

Rejected: treating each 0.minor as a major, as `^` ranges do. It would archive every 0.x minor, used or not, which is the clutter this spec exists to avoid.

### `codenhub.docs.versions`

A package lists further versions to keep in its `package.json`:

```json
{
  "codenhub": {
    "docs": {
      "versions": ["^0.4.0", "0.3.2"]
    }
  }
}
```

- `versions`: OPTIONAL array of unique, non-empty strings, each a SemVer range in the syntax of the `semver` package.
- Each entry keeps **one** release: the newest stable release that satisfies it. `^0.4.0` follows the 0.4 line, so a later 0.4.3 replaces 0.4.2 without editing the list; `0.3.2` keeps exactly that release. Keeping several lines takes several entries.
- An entry may match only the current version. That keeps nothing yet and is how a line is kept before it stops being current: `^0.5.0` listed while 0.5.1 is current keeps 0.5.x once 0.6.0 is released.
- `hub check` reports a malformed list as an error and an entry that matches no stable release tag as a warning.

The list is read from the working tree on the branch the site builds, not from a release tag. It chooses among releases that are already published rather than adding content, and reading it from a tag would mean releasing a package to keep or drop one of its old versions. `docs/ci.md`, "Publish-scoped content", records this as the second exception, beside `listed: false`, to reading package data only from tags.

Rejected:

- Keeping every release a range matches. `>=0.4.0 <0.6.0` would keep each patch inside it, and a patch is replaced, not kept beside the one it fixes.
- One repository-wide list in the root `package.json`. Which versions have consumers is a judgment about each package.

## URLs

An archived version is served under its exact version, inside the package route `docs/specs/packages-translations.md` leaves for it:

- English: `https://docs.codenhub.dev/<slug>/<version>/<path>/`.
- A translation: `https://docs.codenhub.dev/<locale>/<slug>/<version>/<path>/`.

The current version stays at its unversioned URL, so no existing link changes. The site publishes the same files under an archived version's route as under the current one's, as `docs/specs/packages-documentation.md`, "Publishing" and "LLM documentation", defines them: page Markdown, assets, `LICENSE`, `NOTICE`, `llms.txt`, and `llms-full.txt`, with absolute links pointing inside that version's route. The root `llms.txt` lists the current version only; the site's `catalog.json` lists every kept version and where each other release redirects (`docs/specs/packages-documentation.md`, "Catalog").

Every stable release that is not kept redirects, path included, to the newest kept version that satisfies `^<that release>`, or to the current version when none does. A link to `/<slug>/0.4.2/guides/setup/` therefore follows the 0.4 line to `/<slug>/0.4.3/guides/setup/` when a patch replaces it, and a link to the current version's exact number lands on the unversioned URL. A path the target version does not have gets the not-found page.

The not-found page performs these redirects. The deployment serves it for every missing path, and a script on it replaces the location with the target, keeping the query and fragment. The server's answer is therefore a 404 followed by a client-side redirect, not a 301. That costs nothing this spec relies on, since archived pages are kept out of search engines anyway, but a reader without JavaScript stays on the not-found page.

Rejected: rules in `_redirects`. They give a real 301, but Cloudflare accepts at most 100 rules with a wildcard or placeholder, each release needs two (English and every locale prefix), and the repository already had 36 stable releases when this was written, so the build would outgrow the limit within a few dozen releases. Redirecting only releases that were once archived would fit the limit, but it would need the history of what was archived, and it would lose a redirect when an entry is removed from the list.

Rejected: a line segment such as `/<slug>/v2/` or `/<slug>/v0.4/`. It keeps links stable across patches without redirects, but 0.x would need a segment for a line this spec does not treat as one, an exact pin inside a kept line would need a second form anyway, and the URL would no longer show the number a consumer finds in `node_modules`.

## Presentation

- Each package page offers a version selector listing the current version and the archived ones, newest first, by exact version. Choosing a version opens the same path in it, or its documentation index when it has no such page.
- An archived page carries a notice naming its version and linking to the current version.
- An archived version uses the package's identity — label, slug, status, logo — from the current version. Its own manifest is not read for metadata, so a pre-migration manifest at an old tag (`docs/specs/packages-metadata.md`) never has to be parsed for it.
- Locales follow `docs/specs/packages-translations.md` within each version, using the translations at that version's tag.
- Search covers the current version only. Archived pages are marked `noindex` and left out of the sitemap, so a search engine sends readers to the docs for what they would install today.
- `apps/www` does not version its package pages. It links to the documentation site for older versions.

## Building archived versions

A tag cannot be edited, so an archived version cannot be fixed when a later change to the site or its checks rejects it. The site therefore builds archived content leniently:

- It is rendered without the documentation checks `docs/specs/packages-documentation.md`, "Validation", defines and without the translation drift check. Links and frontmatter are rendered as written; an unknown frontmatter field is ignored.
- If an archived version still cannot be built, such as a page the renderer cannot read, the build drops that version, reports it as a warning naming the package, the version, and the error, and redirects its URLs as for a release that is not kept.
- A failure to fetch or read a tag still fails the build, as `docs/ci.md`, "Publish-scoped content", requires for the current version. That is a defect in the build environment rather than in old content, and the repository can fix it.

The current version keeps every check and fails the build as it does today.

Dropping instead of failing departs from the rule that a failure is never treated as "nothing published". That rule did not weigh content the repository can never correct. Failing the build would leave the site on its last deploy, missing the docs of new releases, until someone changed the site or removed the version from the list, all for a page few people read. The cost is that a dropped version is easy to miss: only the build output reports it. Pull requests do not build the site (`docs/ci.md`, "Previews"), so a change that breaks an archived version shows up only after the merge. A later check that builds archived versions on a pull request touching `apps/docs` or `@codenhub/tools` would catch it earlier.
