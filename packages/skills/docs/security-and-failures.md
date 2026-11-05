---
title: Security and failures
description: Understand overwrite and cleanup risks, diagnose failed installs, and recover from partial writes.
order: 3
---

# Install safely and recover from failures

Installing the [Claude and Codex example](cli.md#repeat-the-selection-without-prompts) writes directly into two skills folders. This page explains what can change there, what the installer's path checks protect, and how to recover if copying fails. The installer reads and writes synchronously and has no rollback.

## Protect existing skills

By default, installation merges directories and overwrites files with matching paths. If you edited `.agents/skills/brainstorming/SKILL.md`, installing that skill again replaces your edits. Back up customized skills before updating.

Files found only at the destination remain. An old reference file or a skill removed from a later package release stays installed until you remove it yourself. To remove one stale skill, delete that skill's directory in each destination where it was installed. The installer does not track which files it owns.

### Destructive cleanup

`--cleanup` recursively and forcibly removes every selected harness skills root before any skill is copied. For our local pair, that means all of `.claude/skills` and `.agents/skills`, including skills from other packages and manually managed files. Shared destinations are removed once, but every harness reading them is affected.

The roots are fixed by the selected harness and scope. Workspace roots resolve from the current working directory, and global roots from your home directory. Check both before running cleanup, and back up the entire selected roots. The [destination table](cli.md#install-destinations) lists the paths.

Cleanup failures are printed as `Failed cleaning`, but installation continues into the affected destination. A cleanup failure alone does not set a nonzero exit code, so exit `0` does not prove that the directory was cleaned. In automation, inspect cleanup output as well as the exit status. If cleaning fails, resolve the reported filesystem problem and inspect the remaining content before trying again.

## Trust and path checks

Skills contain instructions an agent may follow and may carry scripts. Review their content and provenance before allowing an agent to use them. Choose trusted source trees when running from a checkout, grant only the filesystem permissions needed, and check that selected destinations are appropriate. The installer does not establish that the instructions or scripts are safe.

Before copying each skill, the installer resolves its source and as much of the destination path as already exists to their actual filesystem locations. It rejects a destination that resolves to the source itself or inside it, including through existing destination symlinks. This prevents recursive self-copying. If a checkout or symlink arrangement triggers this error, install into a separate directory outside that skill's source tree.

Source symlinks must resolve inside that individual skill's source tree. A link to a sibling skill or a file elsewhere is rejected with a directory traversal error. An accepted link is followed and its resolved contents are copied, rather than preserving the link. Canonical directories already visited are skipped to avoid symlink cycles. When authoring a skill, put needed files inside its own directory instead of linking to external files.

These checks constrain source reads and prevent self-copying; they are not a filesystem sandbox. They do not make an untrusted tree safe to copy into a sensitive destination. Filesystem state can also change between checks and operations. Avoid installing from attacker-controlled trees or into paths others can change during installation.

## Diagnose a failed install

The command prints failures and uses these exit codes:

- **`0`:** the selected copies succeeded, or help was printed. Selecting no skills or no harnesses in the wizard prints an exit message and also returns `0`, without installing. Cleanup failures can still have occurred.
- **`130`:** Ctrl+C cancelled the interactive wizard before installation. Run the installer again when ready to make a selection.
- **`1`:** invalid arguments, unknown skill IDs, harness labels invalid for the scope, no detected harness, missing skills, source-loading failures, an unhandled exception, or any skill copy failure. The error output identifies what to correct.

For argument errors, use the IDs in the [catalog](skills.md#bundled-catalog) and scope-qualified labels in the [CLI guide](cli.md#options). If no harness is detected, explicitly select the destinations you intend with `--harnesses`, or use `--all-harnesses` when you want every destination for the scope. Do not add cleanup to resolve a selection error.

If no skills are found or a bundled source cannot be read, use an intact package installation or restore the checkout's skill files. `--include-drafts` additionally fails when there are no drafts or a draft ID duplicates a bundled ID; omit the flag for published installations.

A copy can fail because its source disappeared, a path constraint was violated, or reading, resolving, creating, or writing a filesystem entry failed. The CLI reports `Failed copying` for each affected skill, then continues with remaining skills and destinations. It exits `1` after attempting them all. For permission errors, make the selected destination writable; for file/directory conflicts, back up and resolve the conflicting entry. Check the reported path before changing anything.

## Recover from partial writes

Copies are not transactional: files written before an error remain, overwritten files are not restored, and any successful cleanup is not undone. A later failure in Codex's destination does not undo a successful Claude installation. A failed skill copy may itself contain a mix of old and new files.

Inspect the reported skill and destination, fix the cause, and rerun the same selection without cleanup to copy missing or incomplete files again. Restore from your backup if you need the previous version or your local edits. A rerun still leaves destination-only files in place; inspect and remove stale files separately when necessary. Using `--cleanup` as recovery would also remove unrelated skills.

Next, review [Skill provenance](provenance.md) for the origins and license notices that accompany the skills you install and share.
