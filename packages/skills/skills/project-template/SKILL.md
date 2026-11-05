---
name: project-template
description: Creates, syncs, adopts, and audits projects built on the shared project template (codenhub/template), a pnpm workspace with docs-first guidelines, agent instructions, git hooks, and CI whose files are tracked in `.template/manifest.json`. Use when starting a new project or repository from the template, when asked to sync or update a project with the template, adopt the template in an existing project, or audit a template-based project's structure, and when a task changes a file the template owns. Not for unrelated work in a project that happens to use the template.
---

# Project Template

The template repository is the source of truth for the shared project structure: a pnpm workspace, docs-first guidelines under `docs/`, agent instructions in `AGENTS.md`, git hooks in `.githooks/`, and CI in `.github/`. Read its guidelines there; do not restate or reinterpret them in a project.

The steps use `git`, `pnpm`, and an authenticated GitHub CLI (`gh`). Without `gh`, use the local start and ask the user to create the repository.

The template is the GitHub repository named, as an `owner/repo` string, in `.template/manifest.json#template`, or `codenhub/template` when a project has no manifest yet. Its `.template/README.md`, which every project keeps a copy of, defines the file classes (`canonical`, `blocks`, `seed`), project blocks, placeholders, and `synced`. Read it before any of the work below; this skill says how to apply it.

A project brings its own name, brand, and domain. Never carry a name, owner, or brand from the template or from another project into this one.

## When To Act

- Starting a new project, or asked to sync, adopt, or audit a project's structure: follow the matching section.
- A task needs a change to a `canonical` file, or to the template-owned part of a `blocks` file: follow Upstream.
- Any other task in a project that uses the template: do not sync, adopt, or restructure anything. When you notice the project is behind the template or has drifted from it, say so once in your closing report.

## Approval

Creating a repository, pushing, and opening a pull request or an issue are outward-facing, in the project and in the template alike. Ask before each one; an earlier approval does not carry over. Do everything else locally, on a branch named as the project's contributor guide says.

## New Project

1. **Collect the placeholder values** listed in `.template/README.md`. Derive what you can, use the current year for `{{year}}`, and ask for the rest, including the GitHub owner and the repository's visibility. Never guess the copyright holder.
2. **Create the repository.** Prefer GitHub's template creation, which keeps the hooks' executable bits. Read the template's commit first, then create the repository with the visibility the user chose, `--private` or `--public`:

   ```sh
   git ls-remote https://github.com/codenhub/template HEAD
   gh repo create <owner>/<slug> --template codenhub/template --<visibility> --clone
   ```

   The order matters. Read after creation, the commit can be newer than the copy GitHub made, and the next sync then skips that change without a trace. Read before, it can only be older, and the next sync re-applies a change the project already has, which the three-way merge shows.

   It fails when `<owner>/<slug>` already exists. Check what is there: an empty repository takes the local start below, and one with content is an existing project to sync or adopt.

   For a local start, clone the template, record `git rev-parse HEAD` for step 3, and note which files `git ls-files -s .githooks` shows as `100755`, then remove its `.git`, run `git init -b main`, and stage everything. Hooks staged from a Windows checkout lose their executable bit, and git on Linux and macOS then skips them, so stage each of those files again with `git add --chmod=+x .githooks/<hook>`, and only those. `git ls-files -s .githooks` must then match the template's modes.

   Then turn on "Automatically delete head branches", so merged branches, starting with the bootstrap branch, do not pile up on the remote. It is part of creating the repository; for a repository that already existed, ask first:

   ```sh
   gh repo edit <owner>/<slug> --delete-branch-on-merge
   ```

3. **Record the template commit** as the full SHA in `.template/manifest.json#synced`: the SHA recorded during the local start, or for GitHub's creation the commit read before creating the repository.
4. **Replace every placeholder** in seed files and project blocks. Leave `.template/README.md` alone, since it documents the placeholders, and leave GitHub Actions expressions such as `${{ github.ref }}` alone. This must print nothing:

   ```sh
   git grep -nE '\{\{[a-z]+\}\}' -- ':!.template/README.md'
   ```

   A value the user has not decided yet, such as the license of a private repository, stays a placeholder only when the user says so, and goes in the report.

5. **Install and verify:** `pnpm install`, which also points git at the hooks, then `pnpm verify`.
6. **Commit** the untouched template first and the placeholder replacement second, so the second commit shows exactly what the project changed. For a local start, the untouched template is the first commit on `main`, and the placeholder replacement and any further setup go on a bootstrap branch, such as `chore/bootstrap`, merged by pull request.

The template's pre-push hook refuses any push to `main`, including the first push into an empty repository. Tell the user; pushing with `--no-verify` is their decision, never yours.

## Sync

Start from a clean working tree on a branch. When `synced` is `null`, nothing records where the project started; treat it as an adoption.

1. **Fetch the template** without adding a remote, and look at what changed:

   ```sh
   git fetch https://github.com/<template> HEAD
   git diff --stat <synced> FETCH_HEAD
   ```

2. **Take the classes from the template now:** keep a copy of the project's current `files` map, then copy the `files` map of `git show FETCH_HEAD:.template/manifest.json` into the project's manifest, keeping its own `template` and `synced`. Handle a file whose class changed under its new class, and report it. A file the old map lists and the new one does not was removed or renamed by the template.
3. **Apply `canonical` and `blocks` changes** with a three-way merge, which also adds, deletes, and sets the mode of files:

   ```sh
   git diff --full-index --binary <synced> FETCH_HEAD -- <canonical and blocks paths from the old map and the new one> | git apply --3way
   ```

   Taking the paths from both maps is what deletes a `canonical` or `blocks` file the template removed; the new map alone no longer lists it. A removed `seed` file belongs to the project: propose deleting it, never delete it. Report every removed file.

   - A conflict in a `canonical` file is a local edit. The template's version wins; show the user the local change first, since it may be worth taking upstream.
   - A conflict in a `blocks` file: keep the text inside every project block exactly as it was, and take the template's text outside them.
   - Fill any placeholder the new template text brings with the project's values.
   - `git diff FETCH_HEAD -- <canonical paths>` must now be empty. Whatever remains is a local edit the template never touched; list it and ask whether to take it upstream or drop it.

4. **Propose `seed` changes; never apply them unasked.** Summarize `git diff <synced> FETCH_HEAD -- <seed paths>` file by file and apply only what the user accepts. Never apply a diff to `pnpm-lock.yaml`; run `pnpm install` after accepted changes to `package.json` or `pnpm-workspace.yaml`.
5. **Finish:** set `synced` to `git rev-parse FETCH_HEAD`, run `pnpm install` and `pnpm verify`, and commit. Report what was applied, the conflicts and how each was resolved, the seed proposals, and any local edits found.

## Adopt

A project that predates the template has no `.template/`. Adoption rewrites files the project has relied on, so present the result as a branch for review and never as a finished change. When the project is not a pnpm workspace, or its tooling differs at the core, adoption is a restructuring decision: describe what would change and ask before starting.

1. Fetch the template as in Sync; its `FETCH_HEAD` is the commit you adopt.
2. Map every file in the template's manifest to the project with `git diff FETCH_HEAD -- <path>`:
   - **Missing:** add `canonical` and `blocks` files, with their project blocks filled from the project or left empty, and propose `seed` files.
   - **`canonical`:** take the template's version. Sort each project difference into outdated (drop), an improvement (Upstream), or project-specific (move it to a project-owned file).
   - **`blocks`:** take the template's text and move the project-specific content into the project blocks. Content that fits no block goes in a project-owned file, or becomes a proposal for a new block in the template.
   - **`seed`:** keep the project's file, and propose template changes worth taking.
   - A project file that does the job of a template file under another name, such as a different hooks directory or lint config, is proposed for replacement, not replaced.
3. Copy `.template/README.md` and `.template/manifest.json` from the template, with `synced` set to the adopted SHA, replace placeholders as for a new project, and run `pnpm install` and `pnpm verify`.
4. Report per file whether it was kept, replaced, or moved into a block, and list everything dropped. Nothing leaves the project without appearing in that list.

## Audit

Report and change nothing:

- How far `synced` is behind the head of the template's default branch.
- Local edits to `canonical` files, `git diff <synced> -- <canonical paths>`, and to `blocks` files outside their blocks.
- Manifest files that are missing, project blocks whose markers are gone, and placeholders left behind.
- Hooks without `100755` in `git ls-files -s .githooks`, and `core.hooksPath` not set to `.githooks`.

## Upstream

When a task improves a `canonical` file or the template-owned part of a `blocks` file, propose making the change in the template instead of keeping a local edit; the next sync then brings it to every project.

- Prepare it on a branch in a checkout of the template, following the template's contributor guide. Pushing it and opening the pull request follow Approval.
- Keep it brand-neutral: no project name, brand, or domain rule. An improvement that holds only for this project belongs in a project block or a project-owned file, not in the template.
- When the task cannot wait for the template, a local edit lands only with the user's agreement, and the report names it as pending upstream. A user who asked for that fix in this project has agreed to the local edit; still propose the template change.

Suggest a template improvement when there is evidence for it: the same change needed in two projects, a trap hit in a project that comes from a template-owned file, or a gap in the template that caused a mistake. Name the evidence; do not suggest changes on taste.
