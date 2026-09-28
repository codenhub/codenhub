# Authoring Patterns

Read this when a skill needs a workflow, an output format, examples, or bundled scripts.

## Workflows

When order and verification matter, give numbered steps and a checklist the agent copies into its work:

```text
Progress:
- [ ] 1. Read the inputs
- [ ] 2. Build the plan
- [ ] 3. Validate the plan
- [ ] 4. Apply it
- [ ] 5. Verify the result
```

When errors are likely, close the loop: apply, validate, fix, and validate again, proceeding only when validation passes. The validator can be a script or a checklist in the skill.

When the work branches, name the decision and the path for each answer:

```markdown
Creating a file? Follow "Create". Editing an existing one? Follow "Edit".
```

## Output Formats

Use a strict template when a parser, a reviewer, or another skill depends on the exact shape. Say "use exactly this structure" and show it.

Use a flexible template when the shape should adapt. Say it is a default and name the parts that may change.

## Examples

Show an input with its output when format or tone is hard to describe:

```markdown
Input: fixed dates showing in the wrong timezone in reports
Output: fix(reports): convert timestamps to UTC before formatting
```

Contrast a bad and a good example when the failure is subtle. Keep examples realistic and directly reusable, never placeholders such as `foo` and `bar`.

## Scripts

Bundle a script when the same deterministic code would otherwise be regenerated on every run, or when the step is fragile.

- Say whether the agent should run the script or read it:

  ```markdown
  Run scripts/check.mjs <file> and fix what it reports.
  See scripts/check.mjs for the matching algorithm.
  ```

- List what the script needs, such as a runtime version or a command-line tool, and never assume it is installed.
- Handle expected errors inside the script and print messages that say what to fix.
- Explain every constant that is not self-evident.
- Keep paths relative to the skill root, with forward slashes.

## Assets

Put templates, schemas, and static files in `assets/`. The agent reads or copies them on demand, so their size costs nothing until they are used.
