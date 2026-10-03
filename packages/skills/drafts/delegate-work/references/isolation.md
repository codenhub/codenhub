# Isolation

Where an editing worker writes, and what that means for your working tree. The result's `isolation` says which happened.

## How it is chosen

`--isolation` defaults to `auto`:

- Read-only roles (`scout`, `reviewer`) run in place. A reviewer of a run whose change waits in a worktree reads that worktree, and its result says `worktree`; there is still nothing to `apply`.
- A single editing worker runs in place, unless one of its routes is a harness that can't be kept to the allowlist in the real tree. Then it gets a worktree.
- Parallel editing workers in a batch each get a worktree.

While an editing worker runs in place, `dispatch` refuses to start another editing run, in place or in a worktree: either would start from the first one's unfinished changes. Read-only runs go ahead. Start the next editing run when the first finishes. An in-place run that was cut short holds the tree the same way until it is discarded: its partial edits are still there. Until then `apply` and `unapply` of worktree results wait too, since that discard restores every allowed file that differs from the run's start, including what they wrote.

`--isolation worktree` forces a worktree; `--isolation inplace` skips the routes on a harness that only edits in a worktree.

## In place

The change is already in your working tree when the result comes back: `apply` keeps it, `discard` restores the allowed files from the run's snapshot, keeping a copy of the versions it replaces.

While an editing worker or its checks run in place, the tree is shared with it. An edit you make then counts as the worker's own, and a file outside its allowlist is restored (a copy is kept in the run's state). Whatever writes into the tree (`discard` in place, `unapply`, applying a worktree result) refuses until it finishes.

## Worktree

The change waits in the result's `worktree`, outside the repository, until `apply` copies the worker's version into your tree. Never edit a result's `worktree`: `apply` copies the worker's version and drops the worktree with your edits.

## Interrupted runs

A dispatch stopped halfway (a command timeout, a closed terminal) leaves an interrupted run. Once its worker and checks have stopped, `discard` restores its allowed files, keeping a copy.
