---
name: writing-skills
description: Covers authoring agent skills (SKILL.md bundles) to the Agent Skills specification. Use when creating a new skill, editing, reviewing, or auditing an existing one, fixing a skill agents ignore or misapply, or turning a repeated workflow into a skill.
metadata:
  short-description: Create and validate reusable skills
---

# Writing Skills

A skill is instructions another agent loads in the middle of its own task. It earns its place only by changing what that agent does; every other line is context the agent pays for and ignores.

## Before Writing

- **Confirm a skill is the right tool.** Write one for reusable procedure or knowledge an agent lacks and would not infer. Put project facts in the project's agent instructions or docs, and enforce anything a linter, test, or script can check there instead.
- **Find the gap.** Run the task without the skill, or recall a real run, and name what went wrong. A rule with no observed failure behind it is a guess.
- **Check what exists.** Extend an existing skill before adding an overlapping one. Every installed skill's description is loaded into every session.

## Hard Rules

These are mechanical. When the repository ships automated skill checks, run them; otherwise verify each by hand.

Frontmatter:

- `name`: 1–64 characters of `a-z`, `0-9`, and single hyphens, not starting or ending with one; equal to the directory name; never containing `anthropic` or `claude`.
- `description`: 1–1024 characters on one line, no XML tags. Block scalars (`>` or `|`) are not portable.
- Only the specification's keys: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Harness-specific settings belong in that harness's own files, such as `agents/openai.yaml`.

Layout:

- The `SKILL.md` body stays under 500 lines.
- Supporting files live in `references/`, `scripts/`, or `assets/`; `agents/` holds harness metadata, and `NOTICE` or `LICENSE` carry attribution.
- `SKILL.md` links every reference file with a relative, forward-slash path. A file nothing links is never read.
- References stay one level deep: a reference file does not point to another file in the skill. Agents often only preview a file reached through a second hop.
- A reference file over 100 lines opens with a `## Contents` section.

## The Description

The description is the only part of a skill always in context. If it does not match the task, the rest of the skill does not exist.

- Say what the skill covers and when to use it, in the third person.
- Lead with the words that appear in real requests: task names, file types, tools, symptoms, error text.
- Match the real scope. A skill meant for every coding task says so; a narrow one names its triggers and, when it helps, what it is not for.
- Never summarize the workflow. An agent given the steps in the description follows those and skips the body.

```yaml
# Bad: vague, and the second one summarizes the workflow
description: Helps with tests.
description: Use for TDD - write a test, watch it fail, write code, refactor.

# Good: domain plus triggers
description: Enforces test-first development on code changes. Use when implementing a feature, fixing a bug, refactoring, or otherwise changing behavior in code.
```

## The Body

- **Assume a capable agent.** Add only what it lacks: project-specific steps, non-obvious constraints, judgment it gets wrong. Cut explanations of general concepts.
- **Write imperatives with one term per concept.** Give a default and its exception instead of a menu: "Use X. For Y, use Z."
- **Match freedom to fragility.** Heuristics for judgment calls; exact commands or a script for steps that break under variation.
- **Make rules unconditional.** A rule that applies only when a label, prefix, keyword, or mode name is present gets skipped whenever that marker is missing. State where the rule applies and list its exceptions.
- **Keep the skill out of its output.** Code, comments, commits, and documents a skill produces follow the project's conventions and never name the skill or the agent.
- **Stay tool-agnostic.** Describe capabilities ("run the tests", "delegate to a subagent when available"), not one harness's tool names or slash commands.
- **Steer format with examples.** Examples steer format and tone more reliably than description. Make them mirror real use, and vary them enough that the agent does not copy an unintended pattern.
- **Avoid time-sensitive statements.** Describe the current way; drop what it replaced.
- **Push rare branches into references.** Say in `SKILL.md` when to read each one.

For workflow, template, example, and script patterns, read [references/patterns.md](references/patterns.md).

## Wording

Current models follow instructions closely, so phrasing changes how often a rule fires.

- **Use plain directives.** "Run the tests before committing." Capitals, "CRITICAL", and "You MUST" make current models over-apply a rule; add emphasis only when an evaluation shows the plain wording is ignored.
- **Give the reason for a rule that is not obvious.** "Never use ellipses; a text-to-speech engine reads the output" lets the agent handle cases the rule did not list.
- **Say what to do.** State the wanted behavior, and pair a necessary prohibition with its alternative: "Do not mock the database; use the test container."
- **Put the most important rules first, and keep them few.** Adherence drops as instructions pile up, and earlier ones win.
- **Keep exact values in `SKILL.md`.** Output formats, thresholds, and required strings the task depends on belong in the body, not in a reference the agent may not read.

## Evaluate To The Risk

| Change                                                                           | Minimum evidence                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New skill, or a behavioral change: triggers, rules, workflow order, gates        | Run at least three realistic scenarios without the change and record each outcome. Rerun with it: every failure the change targets is gone, and scenarios that already passed, such as one where the skill should not trigger, still pass. |
| Discipline skill: a rule agents are tempted to skip under pressure               | The above, plus pressure scenarios. Counter each rationalization you observe, quoted verbatim.                                                                                                                                             |
| Editorial change: wording, formatting, or links with no intended behavior change | The hard rules, then a re-read of the diff confirming no rule, trigger, or order changed. When unsure, treat the change as behavioral.                                                                                                     |

Run scenarios in a fresh context that holds only the skill and the task, such as a subagent or a new session. Read [references/evaluation.md](references/evaluation.md) to design and run them.

State what was evaluated and the result where the change is reviewed. If a change was not evaluated, say so.

## Review Checklist

- [ ] The gap was observed, not imagined.
- [ ] Every hard rule passes.
- [ ] The description says what and when, in the third person, with real trigger words and no workflow.
- [ ] Every line changes behavior; nothing restates what a capable agent already knows.
- [ ] No rule depends on a marker being present, and no output names the skill.
- [ ] Rules are plain directives, with reasons where they are not obvious and no emphasis without evidence.
- [ ] Instructions are tool-agnostic.
- [ ] Evaluation matches the risk, and its result is recorded.

## Common Mistakes

- Narrating one past task instead of writing reusable guidance.
- Adding rules for failures nobody observed.
- Growing `SKILL.md` with material only one branch needs.
- Writing several skills and evaluating none of them; finish one first.
