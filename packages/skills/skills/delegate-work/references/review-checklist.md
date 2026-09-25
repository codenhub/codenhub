# Review checklist

For `ok` results from `fixer` and `builder`. The checks already passed; this is
about what checks can't see. Read the diff (`git diff` in the result's worktree,
or `dispatch diff <id>`), not the worker's summary.

Reject or fix if any of these fail:

1. **Solves the stated goal**, not a neighbouring one. Compare against the
   brief's GOAL and ACCEPTANCE, case by case.
2. **Nothing gamed.** No weakened types, ignore directives, disabled rules,
   skipped or loosened tests, special-casing of test inputs, or swallowed errors.
3. **Tests test the behavior.** They would fail without the change and cover
   every acceptance case (builder). A test that only restates the
   implementation doesn't count.
4. **Stays within the brief's DECISIONS** (builder): signatures, names, layout,
   error behavior exactly as specified.
5. **Reads like the codebase.** Matches surrounding style and patterns; no
   agent-flavored comments, no leftover debugging, no dead code.
6. **No unrequested changes** hidden in the in-scope files: renames, reformatting,
   reordered imports, "cleanups".

Nits (naming, small style issues) are not a reason to discard: apply, then fix
them yourself if they matter. A reason to discard is anything you would not
accept from a person in code review.
