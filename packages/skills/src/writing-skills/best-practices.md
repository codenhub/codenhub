# Best Practices

Optional heuristics for making skills easier to discover, load, and use. `SKILL.md` carries the core operating model; this file is for sharpening structure, examples, and supporting material.

## Contents

- Core Principles
- Structure and Discovery
- Progressive Disclosure
- Authoring Patterns
- Supporting Files and Executable Assets
- Evaluation and Iteration
- Sanity Check

## Core Principles

### Concise Is Key

The context window is shared with everything else the agent needs. Only add guidance the agent is unlikely to infer correctly on its own.

Good:

````markdown
## Extract PDF Text

Use `pdfplumber`:

```python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
````

Bad:

```markdown
## Extract PDF Text

PDF files are common. There are many libraries. First choose one, then install it...
```

### Set Appropriate Degrees of Freedom

Match the specificity of the skill to the fragility of the task.

- **High freedom:** text instructions when many approaches are valid
- **Medium freedom:** templates or pseudocode when there is a preferred pattern
- **Low freedom:** exact commands or scripts when the process is fragile

Rule of thumb: the easier it is for variation to break the task, the less freedom the skill should allow.

### Test Across Intended Profiles

Test the skill with the execution profiles you care about:

- smaller or faster profiles: enough guidance?
- balanced profiles: clear and efficient?
- stronger reasoning profiles: still concise and not over-explained?

Use `testing-skills-with-subagents.md` for the full testing workflow.

## Structure and Discovery

### Frontmatter Requirements

`SKILL.md` needs YAML frontmatter with at least:

- `name`
- `description`

Keep the frontmatter short and discovery-focused.

### Naming Conventions

Use descriptive names that signal the action or domain.

Good:

- `writing-skills`
- `testing-skills-with-subagents`
- `managing-databases`

Avoid:

- `helper`
- `utils`
- `tools`
- vague collection names with no clear action or scope

### Writing Effective Descriptions

The description field is the primary discovery hook. It should tell the agent when the skill should be loaded.

Use this pattern:

- start with `Use when...`
- describe triggering conditions first
- include concrete keywords and symptoms
- keep it in third person
- avoid summarizing the internal workflow

Good:

```yaml
description: Use when analyzing Excel files, spreadsheets, tabular reports, or .xlsx data that need summaries, validation, or chart generation.
```

Bad:

```yaml
description: Processes data.
```

Bad:

```yaml
description: I can help you process spreadsheets.
```

### Discovery Coverage

Use words an agent would actually search for:

- symptoms
- synonyms
- tools, commands, libraries, and file types
- error messages or recurring failure phrases when relevant

### Cross-Referencing Other Skills

When another skill is relevant, refer to it by skill name and explain why it matters.

Good:

- `**Required background:** Understand test-driven development before using this skill.`
- `**Required sub-skill:** Use executing-plans to carry out this plan.`

Bad:

- references that force extra reading without saying why

## Progressive Disclosure

`SKILL.md` should act as an overview that points to deeper material only when needed.

Why this matters:

1. metadata is available for discovery
2. `SKILL.md` is read when the skill triggers
3. supporting files are read on demand
4. executable utilities can be run without loading their full source into context

Useful patterns:

- **High-level guide with references:** keep the main flow in `SKILL.md`, point to `reference.md` or `examples.md` for detail
- **Domain-specific organization:** split large references by domain so only the relevant file needs to be loaded
- **Conditional details:** put uncommon branches in supporting files instead of bloating the main file

Keep references shallow:

- Prefer one level deep from `SKILL.md`
- Avoid chains such as `SKILL.md -> advanced.md -> details.md`
- If a reference file grows past roughly 100 lines, add a short contents section near the top

## Authoring Patterns

### Use Workflows for Multi-Step Tasks

If success depends on order and verification, write an explicit workflow.

Example:

```text
Task Progress:
- [ ] Analyze inputs
- [ ] Build the plan or mapping
- [ ] Validate the plan
- [ ] Execute the change
- [ ] Verify the output
```

### Build Feedback Loops In

Use a validate-fix-repeat pattern when errors are likely.

Example:

```markdown
1. Make the change
2. Validate immediately
3. If validation fails, fix and validate again
4. Proceed only when validation passes
```

### Use Templates Only When Shape Matters

Use strict templates when output format must be exact. Use flexible templates when adaptation is expected.

### Use Examples When Style Is Hard to Infer

One strong input/output example is usually better than several weak ones. Prefer realistic, directly reusable examples over contrived placeholders.

### Use Consistent Terminology

Pick one term and stick to it.

Good:

- always `API endpoint`
- always `field`
- always `extract`

Bad:

- mixing `URL`, `route`, `path`, and `endpoint`
- mixing `field`, `element`, `box`, and `control`

### Avoid Time-Sensitive Wording

Avoid guidance that will age badly.

Bad:

```markdown
If you are doing this before August 2025, use the old API.
```

Better:

```markdown
Use the v2 API endpoint.

The v1 API is deprecated and should only be referenced for legacy maintenance.
```

### Avoid Offering Too Many Equivalent Options

Do not give five interchangeable choices unless there is a real decision to make.

Bad:

```markdown
You can use library A, B, C, or D for this task.
```

Good:

```markdown
Use library A by default.
For scanned documents that need OCR, use library B instead.
```

## Supporting Files and Executable Assets

Only include scripts or utilities when they add real value.

Rules:

- say whether the agent should execute the script or read it as reference
- handle expected error conditions instead of punting everything back to the agent
- document constants instead of leaving magic values unexplained
- list required packages or external tools explicitly
- do not assume tools are already installed

Good:

```python
def process_file(path):
    try:
        with open(path) as handle:
            return handle.read()
    except FileNotFoundError:
        with open(path, "w") as handle:
            handle.write("")
        return ""
```

Bad:

```python
def process_file(path):
    return open(path).read()
```

Additional guidance:

- use verifiable intermediate outputs for high-risk or batch operations
- use visual analysis only when the task depends on layout or other visual structure
- file paths, file names, and structure matter because the skill behaves like a small filesystem bundle
- if a skill uses MCP tools, use fully qualified names such as `ServerName:tool_name`

## Evaluation and Iteration

Use a lightweight loop:

1. run representative tasks without the skill
2. identify the guidance that was actually missing
3. write the minimal instructions that close the gap
4. re-run the tasks and refine

When iterating, pay attention to:

- file-read order that suggests the structure is awkward
- references agents miss repeatedly
- sections constantly read that may belong in `SKILL.md`
- supporting files that are never used and may be unnecessary

Use `testing-skills-with-subagents.md` when you need the full RED-GREEN-REFACTOR test process rather than a light evaluation loop.

## Sanity Check

- [ ] `name` and `description` are specific and discoverable
- [ ] `SKILL.md` stays concise and scannable
- [ ] Supporting files exist only when they add real value
- [ ] References are shallow and easy to follow
- [ ] Examples are concrete and reusable
- [ ] Terminology is consistent
- [ ] Dependencies and tools are explicit
- [ ] The skill has been tested on the profiles and workflows you care about
