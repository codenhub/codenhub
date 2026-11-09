---
name: project-template
description: Creates projects from the shared project template (codenhub/template), a stack-neutral core of docs-first guidelines, agent instructions, git hooks, and CI with a profile per stack, compares existing projects with it, and migrates projects off its earlier `.template/manifest.json` design. Use when starting a new project or repository from the template, when asked to sync, update, compare, or audit a project against the template, to adopt the template in an existing project, or to remove a project's template manifest, markers, or conformance check. Not for unrelated work in a project that happens to come from the template.
---

# Project Template

The template is a starting point and a reference. A project created from it keeps no tie to it: no `profiles/` directory or other template-only file, no record of a sync, nothing in CI. Comparing a project with the template is something someone chooses to do, and each difference is judged on which side is better.

The procedure, and the design behind it, lives in the template's `profiles/README.md`. A created project has no `profiles/`, and a project from the manifest design has an outdated `.template/README.md`, so always read the fetched README: it is the authority, and this skill follows it where the two differ. Fetch the template without adding a remote and read it before any of the work below; follow it rather than restating it, since this skill adds only what an agent needs around it:

```sh
git fetch --no-tags https://github.com/<template> HEAD
git show FETCH_HEAD:profiles/README.md
```

Outside a Git repository, as when starting a new project, `git fetch` has nowhere to fetch into: run both commands in a scratch repository made with `git init`, outside the place the project will go, and delete it once the project exists. When the fetched template has no `profiles/README.md`, it predates the split into profiles, as a fork may: say so and ask the user how to go on rather than following its `.template/README.md`, which describes the manifest design.

`<template>` is `codenhub/template` unless the user names another `owner/repo`; use the same one in every command below, and in the README's commands, which name `codenhub/template`. Any other fetch overwrites `FETCH_HEAD`, so fetch the template again before reading it. The steps use `git`, the chosen profile's tools, such as Node.js and `pnpm` for `node-pnpm`, and an authenticated GitHub CLI (`gh`); without `gh`, use the local start and ask the user to create the repository.

A project brings its own name, brand, and domain. Never carry a name, owner, or brand from the template or from another project into this one.

## When To Act

- Starting a new project, comparing a project with the template, or migrating one: follow the matching section. A request to sync or update a project with the template is a comparison.
- Any other task in a project that came from the template: compare, migrate, or restructure nothing. When you notice the project still has `.template/manifest.json`, say once in your closing report that it can be migrated.

## Approval

Creating a repository, pushing, and opening a pull request or an issue are outward-facing, in the project and in the template alike. Ask before each one; an earlier approval does not carry over. Do everything else locally, on a branch named as the project's contributor guide says.

## New Project

1. **Choose the profile and collect the placeholder values** in the README's tables. The profile is the project's stack, from the README's list; when none fits, say so and ask, and never write a profile unasked. `{{setup}}` and `{{verify}}` come from the profile's row. Derive what you can, use the current year for `{{year}}`, and ask for the rest, including the GitHub owner and the repository's visibility. Never guess the copyright holder.
2. **Create the repository.** Prefer GitHub's template creation, which keeps the hooks' executable bits, with the visibility the user chose, `--private` or `--public`:

   ```sh
   gh repo create <owner>/<slug> --template <template> --<visibility> --clone
   ```

   It fails when `<owner>/<slug>` already exists. Check what is there: an empty repository takes the local start below, and one with content is an existing project to compare.

   For a local start, clone the template, note which files `git ls-files -s .githooks` shows as `100755`, then remove its `.git`, run `git init -b main`, add the new repository as `origin` with `git remote add origin https://github.com/<owner>/<slug>.git`, and stage everything. Hooks staged from a Windows checkout lose their executable bit, and git on Linux and macOS then skips them, so stage each of those files again with `git add --chmod=+x .githooks/<hook>`, and only those. `git ls-files -s .githooks` must then match the template's modes.

   Then, whichever way the repository was created, turn on "Automatically delete head branches", so merged branches, starting with the bootstrap branch, do not pile up on the remote. It is part of creating the repository; for a repository that already existed, ask first:

   ```sh
   gh repo edit <owner>/<slug> --delete-branch-on-merge
   ```

   Without `gh`, ask the user to turn it on under the repository's Settings, General, Pull Requests.

3. **Follow "Creating a project"** in the README: delete the template-only files and lay the profile over the core, replace the placeholders, run the placeholder check, then the profile's setup commands, which also point git at the hooks, and its gate. Leave GitHub Actions expressions such as `${{ github.ref }}` alone. A value the user has not decided yet, such as the license of a private repository, stays a placeholder only when the user says so, and goes in the report.
4. **Fill the prompts** the documentation guidelines describe, the HTML comments in the documents, from what the user has told you about the project. Leave a prompt you have nothing for, and list it in the report for the user to fill or delete.
5. **Commit** the untouched template first and the rest second, so the second commit shows exactly what the project changed. GitHub's template creation already made the first commit on `main`. For a local start, the untouched template is the first commit on `main`. Either way, the profile step, the placeholder replacement, and any further setup go on a bootstrap branch, such as `chore/bootstrap`, merged by pull request.

The template's pre-push hook refuses any push to `main`, including the first push into an empty repository. Tell the user; pushing with `--no-verify` is their decision, never yours.

## Compare

Follow "Comparing a project with the template" in the README, from the project's repository: one comparison with the core and one with the profile the project started from. A project created before the split into profiles started from `node-pnpm`. A project that still has `.template/manifest.json` is migrated first, as its own commit; see Migrate.

- **Judge each hunk, not each file.** For each one, decide which side is better: the template's, the project's, or a difference that is the project's own, such as its name, its packages, or a rule only it needs. Judge on what each version does for this project, not on which is newer; the template's version of a file is not the correct one by default.
- **Take the template's side on a branch.** Apply each hunk where the template is better, then rerun the project's own setup commands, as its contributor guide gives them, when a dependency manifest changed, and the gate. A hunk that would change the project's behavior, public contract, or a decision its documentation records is presented as a choice, with your recommendation, rather than taken.
- **Keep the project's side without recording it.** Nothing in the project records which differences were kept; a kept difference shows up again in the next comparison, and that is intended. Do not add a file, comment, or list to suppress it.
- **When asked only to audit or report,** change nothing: report the judgments below and ask before applying any.

A project that predates the template is compared the same way. The diff is large, and a file shown as removed is one the project never had: judge whether to add it. Present the result as a branch for review, never as a finished change, since it rewrites files the project has relied on. When no profile matches the project's stack, compare with the core only, and say so; when its tooling differs from its profile's at the root, adopting the profile is a restructuring decision: describe what would change and ask before starting. A project file that does the job of a template file under another name, such as a different hooks directory or lint config, is proposed for replacement, not replaced.

Report per file, and per hunk where a file has more than one verdict, which side won and why. Then list what was taken, what was kept, what is suggested upstream, and the choices left for the user. Leave out the placeholder values, which are not differences to judge.

## Migrate

A project created before the template became a reference still has `.template/`, a manifest, `project:start`/`project:end` markers, and a "Template conformance" CI step. Follow "Projects from the manifest design" in the fetched README, not the project's own `.template/README.md`, which describes the old design.

Before deleting `.template/`, note the reasons in its manifest's `exceptions`, if any: they explain differences the next comparison will show again, and help judge them. Commit the migration on its own, before any comparison, so the removal of the ties is reviewable apart from any change in content. Migrating changes nothing the project's code does, but CI stops checking for template drift, which is the point; say so in the report. When the README's final `git grep` prints something, a document that describes the manifest, the markers, or the checker, such as a paragraph in `docs/ci.md` about the conformance step, is updated or removed in the same commit; report anything else it prints rather than deleting text you have not judged.

## Upstream

Proposing a change to the template is optional; keeping a better version only in the project is always acceptable. Suggest an upstream change when there is evidence for it, and name the evidence: the same improvement made in two projects, a trap a project hit that comes from a file it took from the template, or a gap in the template that caused a mistake. Do not suggest changes on taste.

- Prepare it on a branch in a checkout of the template, following the template's contributor guide. Filing an issue, pushing, and opening the pull request follow Approval.
- Keep it brand-neutral: no project name, brand, or domain rule. An improvement that holds only for this project stays in the project.
