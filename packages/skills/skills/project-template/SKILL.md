---
name: project-template
description: Creates, syncs, adopts, and audits projects built on the shared project template (codenhub/template), a pnpm workspace with docs-first guidelines, agent instructions, git hooks, and CI whose files are tracked in `.template/manifest.json`. Use when starting a new project or repository from the template, when asked to sync or update a project with the template, adopt the template in an existing project, or audit a template-based project's structure, and when a task changes a file the template owns. Not for unrelated work in a project that happens to use the template.
---

# Project Template

The template repository is the source of truth for the shared project structure. Its `.template/README.md`, which every project keeps a copy of, defines the file classes (`canonical`, `blocks`, `seed`), project blocks, placeholders, `synced`, and `exceptions`, says how to sync, and documents `node .template/check.mjs`, which reports drift. Read it before any of the work below, and follow it rather than restating it; this skill adds what an agent needs around it.

A project last synced before the template gained the check and the sync procedure has neither. Read the procedure from the fetched template, `git show FETCH_HEAD:.template/README.md`, and run the fetched check from the project root: save `git show FETCH_HEAD:.template/check.mjs` to a file outside the repository and run `node <that file>`. Both reach the project with its next sync.

The template is the GitHub repository named, as an `owner/repo` string, in `.template/manifest.json#template`, or `codenhub/template` when a project has no manifest yet. The steps use `git`, `pnpm`, and an authenticated GitHub CLI (`gh`). Without `gh`, use the local start and ask the user to create the repository.

A project brings its own name, brand, and domain. Never carry a name, owner, or brand from the template or from another project into this one.

## When To Act

- Starting a new project, or asked to sync, adopt, or audit a project's structure: follow the matching section.
- A task needs a change to a `canonical` file, or to the template-owned part of a `blocks` file: follow Upstream.
- Any other task in a project that uses the template: do not sync, adopt, or restructure anything. When `node .template/check.mjs` fails or reports the project behind, say so once in your closing report.

## Approval

Creating a repository, pushing, and opening a pull request or an issue are outward-facing, in the project and in the template alike. Ask before each one; an earlier approval does not carry over. Do everything else locally, on a branch named as the project's contributor guide says.

## New Project

1. **Collect the placeholder values** listed in the template's `.template/README.md`. Derive what you can, use the current year for `{{year}}`, and ask for the rest, including the GitHub owner and the repository's visibility. Never guess the copyright holder.
2. **Create the repository.** Prefer GitHub's template creation, which keeps the hooks' executable bits. Read the template's commit first, then create the repository with the visibility the user chose, `--private` or `--public`:

   ```sh
   git ls-remote https://github.com/codenhub/template HEAD
   gh repo create <owner>/<slug> --template codenhub/template --<visibility> --clone
   ```

   The order matters. Read after creation, the commit can be newer than the copy GitHub made, and the next sync then skips that change without a trace. Read before, it can only be older, and the next sync re-applies a change the project already has, which the three-way merge shows.

   It fails when `<owner>/<slug>` already exists. Check what is there: an empty repository takes the local start below, and one with content is an existing project to sync or adopt.

   For a local start, clone the template, record `git rev-parse HEAD` for step 3, and note which files `git ls-files -s .githooks` shows as `100755`, then remove its `.git`, run `git init -b main`, and stage everything. Hooks staged from a Windows checkout lose their executable bit, and git on Linux and macOS then skips them, so stage each of those files again with `git add --chmod=+x .githooks/<hook>`, and only those. `git ls-files -s .githooks` must then match the template's modes.

   Then, whichever way the repository was created, turn on "Automatically delete head branches", so merged branches, starting with the bootstrap branch, do not pile up on the remote. It is part of creating the repository; for a repository that already existed, ask first:

   ```sh
   gh repo edit <owner>/<slug> --delete-branch-on-merge
   ```

   Without `gh`, ask the user to turn it on under the repository's Settings, General, Pull Requests.

3. **Record the template commit** as the full SHA in `.template/manifest.json#synced`: the SHA recorded during the local start, or for GitHub's creation the commit read before creating the repository.
4. **Replace every placeholder** in seed files and project blocks. Leave `.template/README.md` alone, since it documents the placeholders, and leave GitHub Actions expressions such as `${{ github.ref }}` alone. A value the user has not decided yet, such as the license of a private repository, stays a placeholder only when the user says so, and goes in the report.
5. **Install and verify:** `pnpm install`, which also points git at the hooks, then `node .template/check.mjs` and `pnpm verify`. The check fails on a placeholder left behind.
6. **Commit** the untouched template first and the placeholder replacement second, so the second commit shows exactly what the project changed. For a local start, the untouched template is the first commit on `main`, and the placeholder replacement and any further setup go on a bootstrap branch, such as `chore/bootstrap`, merged by pull request.

The template's pre-push hook refuses any push to `main`, including the first push into an empty repository. Tell the user; pushing with `--no-verify` is their decision, never yours.

## Sync

Follow "How to sync" in the fetched template's `.template/README.md`. When `synced` is `null`, nothing records where the project started; treat it as an adoption.

Read it from `git show FETCH_HEAD:.template/README.md` before applying anything rather than from the project's copy: when the template changed the procedure, the one that applies is the new one, and a project from before it has none.

Report what was applied, each conflict and how it was resolved, each block a clean merge changed and was restored, the seed changes proposed and which the user took, and any local edit to a template-owned file, with whether to take it upstream.

## Adopt

A project that predates the template has no `.template/`, so read the conventions from the fetched template, `git show FETCH_HEAD:.template/README.md`. Adoption rewrites files the project has relied on, so present the result as a branch for review and never as a finished change. When the project is not a pnpm workspace, or its tooling differs at the core, adoption is a restructuring decision: describe what would change and ask before starting.

1. Fetch the template as the README's sync does; its `FETCH_HEAD` is the commit you adopt.
2. Map every file in the template's manifest to the project with `git diff FETCH_HEAD -- <path>`:
   - **Missing:** add `canonical` and `blocks` files, with their project blocks filled from the project or left empty, and propose `seed` files.
   - **`canonical`:** take the template's version. Sort each project difference into outdated (drop), an improvement (Upstream), or project-specific (move it to a project-owned file).
   - **`blocks`:** take the template's text and move the project-specific content into the project blocks. Content that fits no block goes in a project-owned file, or becomes a proposal for a new block in the template.
   - **`seed`:** keep the project's file, and propose template changes worth taking.
   - A project file that does the job of a template file under another name, such as a different hooks directory or lint config, is proposed for replacement, not replaced.
   - A template file the project deliberately does without, or keeps its own version of, is an exception: propose it, with the reason, rather than leaving it as drift.
3. Copy `.template/README.md`, `.template/manifest.json`, and the rest of `.template/` from the template, with `synced` set to the adopted SHA and any accepted exceptions recorded, replace placeholders as for a new project, and run `pnpm install`, `node .template/check.mjs`, and `pnpm verify`.
4. Report per file whether it was kept, replaced, moved into a block, or recorded as an exception, and list everything dropped. Nothing leaves the project without appearing in that list.

## Audit

Report and change nothing. Run `node .template/check.mjs`, or the fetched check when the project has none, and report its output: how far `synced` is behind the template, and every failure with the file and line it names. Each failure is resolved by syncing, proposing the change upstream, recording an exception, or a local fix, as the README says; name which applies, and ask before acting on any of them.

## Upstream

When a task improves a `canonical` file or the template-owned part of a `blocks` file, propose making the change in the template instead of keeping a local edit; the next sync then brings it to every project.

- Prepare it on a branch in a checkout of the template, following the template's contributor guide. Pushing it and opening the pull request follow Approval.
- Keep it brand-neutral: no project name, brand, or domain rule. An improvement that holds only for this project belongs in a project block or a project-owned file, not in the template.
- When the task cannot wait for the template, a local edit lands only with the user's agreement, and the report names it as pending upstream. A user who asked for that fix in this project has agreed to the local edit; still propose the template change. Until the sync that brings it, the check reports the edit; that failure is expected and goes in the report.

Suggest a template improvement when there is evidence for it: the same change needed in two projects, a trap hit in a project that comes from a template-owned file, or a gap in the template that caused a mistake. Name the evidence; do not suggest changes on taste.
