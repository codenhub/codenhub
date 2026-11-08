# Template conventions

This repository started from a shared project template. This directory records how its files relate to that template, so the template's improvements can reach this project and this project's improvements can reach the template. It is read by people and by agents; keep it in the project.

The template is brand-agnostic. It carries structure, tooling, and the general guidelines; a project brings its own name, brand, and domain rules.

## File classes

`manifest.json` assigns every file the template ships to one class:

| Class       | Meaning                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canonical` | The template owns the whole file. A project does not edit it locally; it changes it in the template and syncs.                                                                               |
| `blocks`    | The template owns the file except its project blocks. Text inside a project block belongs to the project and survives a sync; text outside it is the template's.                             |
| `seed`      | The template provides a starting point, copied once. The project owns it from then on. A sync may suggest a template change to a seed file, but never applies one without the project's say. |

A file the manifest does not list belongs to the project.

`manifest.json#template` names the template repository as `owner/repo`, the one a sync fetches from.

The frontmatter values of a `blocks` document belong to the project, as if the frontmatter were a block: `status`, `last_updated`, and `scope` describe this project's copy, such as whether its code complies and when it last changed, so a sync keeps the project's values. The fields themselves are set by the [documentation guidelines](../docs/guidelines/documentation.md).

## Project blocks

A project block opens and closes with a marker in the file's own comment syntax:

```md
<!-- project:start -->

Project-specific text.

<!-- project:end -->
```

```sh
# project:start
# project:end
```

```jsonc
// project:start
// project:end
```

Plain JSON has no comments and cannot hold a block, so a JSON file that needs one is either read as JSONC by its tool, as `.oxlintrc.json` and `.oxfmtrc.json` are, or written in a format with comments, as `.prettierrc.json5` is. In a list or an object, the block opens it, before the template's entries: oxfmt removes the trailing comma after the last entry, so a block after it would need an edit outside the block to add the first project entry. A later duplicate key wins, so a block that opens an object adds keys and does not change the template's.

A block in the template holds placeholder guidance for what the project puts there, or default content the project keeps or replaces, such as the `push` trigger in `ci.yml`. A sync keeps the project's text in every block, so a later change to a block's default does not reach a project on its own. A file may have several blocks; they do not nest. A block the project leaves empty stays in the file, so a later sync knows where project text goes.

## Placeholders

Seed files and project blocks use these placeholders, replaced when a project is created:

| Placeholder       | Replaced with                                         | Example              |
| ----------------- | ----------------------------------------------------- | -------------------- |
| `{{name}}`        | The project's display name.                           | `Acme Notes`         |
| `{{slug}}`        | The repository and root package name.                 | `acme-notes`         |
| `{{scope}}`       | The npm scope of workspace packages, without the `@`. | `acme-notes`         |
| `{{description}}` | One sentence saying what the project is.              | `A note-taking app.` |
| `{{owner}}`       | The GitHub owner, a user or organization.             | `acme`               |
| `{{holder}}`      | The copyright holder.                                 | `Acme`               |
| `{{year}}`        | The year the project was created.                     | `2026`               |

A placeholder left in a file after creation is a bug.

## Syncing

`manifest.json#synced` records the template commit this project last synced with. A sync takes the `files` map from the template's current manifest, keeping this project's `template` and `synced`, so a file the template added or reclassified gets its new class. It then compares the template at that commit with the template now, applies the changes to `canonical` files and outside the blocks of `blocks` files, proposes changes to `seed` files, and updates `synced`. The comparison against the last synced commit, rather than against the project's own files, is what tells a template change apart from a deliberate project difference.

A project that improves a `canonical` file or the template-owned part of a `blocks` file proposes the improvement to the template instead of keeping a local edit.
