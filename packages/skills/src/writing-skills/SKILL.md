---
name: writing-skills
description: Use when creating, reviewing, testing, revising, or validating skill bundles, including SKILL.md and supporting files.
metadata:
  short-description: Create and validate reusable skills
---

# Writing Skills

## Overview

Writing skills is test-driven development applied to process documentation.

A skill should teach reusable guidance that future agents can discover and apply. Use this skill only for explicit skill work. Do not create or edit skills in the middle of unrelated implementation.

**Core principle:** If you did not watch an agent fail without the skill, you do not know whether the skill teaches the right thing.

Load supporting references only when needed:

- `best-practices.md`: structure, discovery, examples, file layout, and bundled assets
- `testing-skills-with-subagents.md`: testing workflow, pressure scenarios, and meta-testing
- `persuasion-principles.md`: discipline-enforcing skills that must resist rationalization

## Tool Compatibility

- Keep instructions tool-agnostic and avoid provider-specific wording.
- When behavior differs across tools, resolve conflicts in this order: OpenCode > Claude Code > Codex CLI > Gemini CLI.

## What a Good Skill Is

- A reference guide for reusable techniques, patterns, tools, or reference material
- Discoverable from its name and description
- Focused on future execution, not a story about one past task
- Concise enough to load cheaply
- Backed by observed failures and re-testing

Common skill types:

- **Technique:** concrete method with steps to follow
- **Pattern:** way of thinking about a class of problems
- **Reference:** information to retrieve and apply correctly

## Minimal Shape

Keep the skill easy to scan and easy to discover.

- Minimal bundle shape: `skill-name/SKILL.md`
- Supporting files: only for heavy reference material, reusable assets, or substantial worked examples
- Paths in file references: use forward slashes

Frontmatter rules:

- `name` and `description` are required
- `name` uses letters, numbers, and hyphens only
- `description` starts with `Use when...`
- `description` is written in third person
- `description` focuses on triggering conditions and searchable keywords instead of summarizing the full workflow

Suggested body shape:

1. Overview
2. When to use
3. Core pattern or rules
4. Quick reference
5. Implementation notes or links to supporting files
6. Common mistakes

## Discovery and Clarity

- Use words an agent would actually search for: symptoms, synonyms, tools, commands, libraries, file types, and error phrases
- Prefer descriptive names such as `writing-skills` over vague labels such as `helper` or `utils`
- Keep `SKILL.md` concise; move heavy detail into supporting files
- Use one strong example instead of many weak ones
- When cross-referencing another skill, refer to it by skill name and explain why it is needed

## TDD Mapping for Skills

| TDD concept     | Skill creation                                                    |
| --------------- | ----------------------------------------------------------------- |
| Test case       | Pressure scenario with a delegated worker                         |
| Production code | Skill document (`SKILL.md`)                                       |
| RED             | Agent violates the rule or misses the technique without the skill |
| GREEN           | Agent complies with the skill present                             |
| REFACTOR        | Close loopholes while maintaining compliance                      |
| Minimal code    | Write only what addresses the observed failures                   |

The entire skill creation process follows RED-GREEN-REFACTOR.

## Change Types and Validation Depth

Classify each update before editing:

- **Behavioral change:** modifies triggers, required or forbidden actions, workflow ordering, escalation gates, tool expectations, or anything likely to change agent decisions
- **Editorial change:** wording, formatting, typo fixes, heading cleanup, or link/path corrections intended to preserve behavior

Validation policy:

- Behavioral changes require full RED-GREEN-REFACTOR with a failing baseline first
- Editorial changes require lightweight validation:
  1. state the no-behavior-change intent
  2. run at least one before/after scenario or targeted prompt to confirm unchanged decisions
  3. verify frontmatter, links, and references still follow local skill rules
- If uncertain whether a change is behavioral, treat it as behavioral

## The Iron Law

```text
NO BEHAVIORAL SKILL CHANGE WITHOUT A FAILING TEST FIRST
```

This applies to new skills and any edit that can change agent behavior.

For editorial or reference-only updates, use the lightweight validation policy above.

Write or edit a behavioral skill change before baseline testing? Discard that draft and start from an observed failure instead.

**No exceptions for behavioral edits:**

- Not for simple additions
- Not for a new section that feels obvious
- Do not keep untested wording as reference material
- Do not adapt the draft while pretending you are still in RED

## RED-GREEN-REFACTOR

### RED

Run a representative scenario without the skill. Document:

- what the agent chose
- what rationalizations it used, verbatim
- which pressures or missing cues triggered the failure

### GREEN

Write the smallest skill that addresses those specific failures.

Run the same scenario with the skill present. The agent should now comply or apply the technique correctly.

### REFACTOR

If the agent finds a new loophole, encode an explicit counter and test again.

For the full testing method, read `testing-skills-with-subagents.md`.

## Testing Summary

Different skill types need different tests:

| Skill type           | Test focus                                                      | Success criteria                                 |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| Discipline-enforcing | Pressure scenarios, combined pressures, rationalization capture | Agent follows the rule under pressure            |
| Technique            | Application, variation, missing-information scenarios           | Agent applies the method in a new scenario       |
| Pattern              | Recognition, application, counter-examples                      | Agent recognizes when and how to use the pattern |
| Reference            | Retrieval, application, gap testing                             | Agent finds and uses the right information       |

Also test against the execution profiles you care about so the skill is not only clear for one kind of model or tool environment.

## Hardening Against Rationalization

Skills that enforce discipline need to survive pressure and excuse-making.

Compact rules:

- Close loopholes explicitly
- Address spirit-vs-letter arguments directly
- Keep a rationalization table for recurring excuses
- Keep a red-flags list for common failure language
- If a rule is ignored in the same contexts repeatedly, add those violation signals to the description

Example:

Bad:

```markdown
Write code before test? Delete it.
```

Better:

```markdown
Write code before test? Delete it. Start over.

**No exceptions:**

- Do not keep it as reference
- Do not adapt it while writing tests
- Delete means delete
```

Use `persuasion-principles.md` only when the skill needs stronger framing against authority, urgency, sunk cost, or similar pressure.

## Stop Before the Next Skill

After writing one skill, finish validation before moving to the next.

Do not:

- batch multiple untested skills together
- move on before the current skill is verified
- skip re-testing because batching feels faster

## Compact Checklist

Use your task tracker or checklist for each item:

- [ ] Classified the change as behavioral or editorial
- [ ] For behavioral changes, observed baseline failure without the skill
- [ ] For behavioral changes, captured failures and rationalizations verbatim
- [ ] For editorial changes, documented no-behavior-change intent and ran a before/after check
- [ ] Chose a clear, discoverable name
- [ ] Wrote a trigger-focused description with searchable terms
- [ ] Wrote the minimal content needed to address observed failures or the stated editorial intent
- [ ] Justified every supporting file
- [ ] Re-ran scenarios with the skill present
- [ ] Closed new loopholes and re-tested when behavior changed

## Bottom Line

Creating skills is TDD for process documentation.

Same law: failing test first. Same cycle: RED, GREEN, REFACTOR. Same goal: reusable guidance that future agents can actually discover and follow.
