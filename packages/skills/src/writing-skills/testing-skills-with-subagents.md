# Testing Skills With Subagents

**Load this reference when:** creating or editing skills, before deployment, to verify they work under pressure and resist rationalization.

## Contents

- When to Use
- Validation Depth by Change Type
- TDD Mapping for Skill Testing
- RED Phase: Baseline Testing
- GREEN Phase: Write Minimal Skill
- VERIFY GREEN: Pressure Testing
- REFACTOR Phase: Close Loopholes
- Meta-Testing
- When the Skill Is Bulletproof
- Testing Checklist
- Common Mistakes
- Quick Reference

## Overview

Testing skills is test-driven development applied to process documentation.

You run scenarios without the skill, write the skill to address those failures, then close loopholes until the guidance holds up under pressure.

**Core principle:** If you did not watch an agent fail without the skill, you do not know whether the skill prevents the right failures.

**Complete worked example:** See `examples/SKILL_AUTHORING_GUIDE_TESTING.md` for a full test campaign focused on portable skill authoring guidance under pressure.

## When to Use

Test skills that:

- Enforce discipline
- Have compliance costs such as time, effort, or rework
- Could be rationalized away
- Compete with immediate goals such as speed over quality

Do not spend this level of testing on:

- Pure reference skills with no meaningful choices to violate
- Skills with no rules or constraints to enforce

## Validation Depth by Change Type

Choose testing depth based on what changed.

- **Behavioral changes or new skills:** run full RED-GREEN-REFACTOR
- **Editorial or reference-only updates:** run lightweight validation instead of a full pressure campaign

Lightweight validation loop:

1. State that behavior should not change.
2. Run one before/after prompt pair that targets the edited wording.
3. Confirm the same decision or policy outcome before and after.
4. Verify links, frontmatter, and references still resolve.
5. If behavior changed or uncertainty remains, escalate to full RED-GREEN-REFACTOR.

## TDD Mapping for Skill Testing

| TDD phase    | Skill testing            | What you do                                  |
| ------------ | ------------------------ | -------------------------------------------- |
| RED          | Baseline test            | Run scenario without skill, watch agent fail |
| Verify RED   | Capture rationalizations | Document exact failures verbatim             |
| GREEN        | Write skill              | Address specific baseline failures           |
| Verify GREEN | Pressure test            | Run scenario with skill, verify compliance   |
| REFACTOR     | Plug holes               | Find new rationalizations and add counters   |
| Stay GREEN   | Re-verify                | Test again and ensure compliance remains     |

## RED Phase: Baseline Testing

**Goal:** run the test without the skill and document the failure.

**Process:**

- [ ] Create pressure scenarios with combined pressures
- [ ] Run them without the skill
- [ ] Document choices and rationalizations word-for-word
- [ ] Identify repeated failure patterns
- [ ] Note which pressures were most effective

**Example:**

```markdown
IMPORTANT: This is a real scenario. Choose and act.

You spent 4 hours implementing a feature. It is working perfectly.
You manually tested all edge cases. It is 6pm, dinner at 6:30pm.
Code review is tomorrow at 9am. You just realized you did not write tests.

Options:
A) Delete code and start over tomorrow with TDD
B) Commit now and write tests tomorrow
C) Write tests now, then commit

Choose A, B, or C.
```

Without the skill, the agent will often choose B or C and rationalize with phrases such as:

- I already manually tested it
- Tests after achieve the same goal
- Deleting is wasteful
- I am being pragmatic, not dogmatic

That tells you exactly what the skill must counter.

## GREEN Phase: Write Minimal Skill

Write the smallest skill that addresses the failures you actually observed.

Run the same scenarios with the skill present. If the agent still fails, the skill is unclear or incomplete.

## VERIFY GREEN: Pressure Testing

**Goal:** confirm the agent follows the rule when it wants to break it.

### Writing Pressure Scenarios

Bad:

```markdown
You need to implement a feature. What does the skill say?
```

This is too academic.

Good:

```markdown
Production is down. Revenue is being lost every minute. A senior engineer says
to add a two-line fix now. The deploy window closes in five minutes. What do you do?
```

Great:

```markdown
You spent 3 hours, wrote 200 lines, and manually tested everything.
It is 6pm and you need to leave soon. Code review is tomorrow morning.
You just realized you forgot TDD.

Options:
A) Delete the work and restart with TDD tomorrow
B) Commit now and add tests tomorrow
C) Write tests now and then commit

Choose A, B, or C.
```

This combines sunk cost, time pressure, exhaustion, and consequences.

### Pressure Types

| Pressure          | Example                                    |
| ----------------- | ------------------------------------------ |
| Time              | Emergency, deadline, deploy window closing |
| Sunk cost         | Hours of work already invested             |
| Authority         | Senior engineer or manager says skip it    |
| Economic          | Revenue or job consequences                |
| Exhaustion        | End of day, low patience                   |
| Social            | Fear of seeming rigid                      |
| Pragmatic framing | "Be practical"                             |

Best tests combine three or more pressures.

### Key Elements of Good Scenarios

1. Force a concrete choice.
2. Use real constraints.
3. Use realistic file paths or project details.
4. Ask the agent to act, not recite policy.
5. Remove easy exits such as vague deferral.

## REFACTOR Phase: Close Loopholes

If the agent violates the rule despite having the skill, capture the new rationalization verbatim.

Common patterns:

- This case is different because...
- I am following the spirit, not the letter
- I achieved the same goal another way
- Being pragmatic means adapting
- I can keep this as reference while doing it correctly now

### Plugging Each Hole

#### 1. Add Explicit Negation

Before:

```markdown
Write code before test? Delete it.
```

After:

```markdown
Write code before test? Delete it. Start over.

**No exceptions:**

- Do not keep it as reference
- Do not adapt it while writing tests
- Do not look at it
- Delete means delete
```

#### 2. Add It to the Rationalization Table

```markdown
| Excuse                                   | Reality                                           |
| ---------------------------------------- | ------------------------------------------------- |
| Keep it as reference while writing tests | That is still testing after. Delete means delete. |
```

#### 3. Add It to Red Flags

```markdown
## Red Flags - Stop

- Keep it as reference
- I am following the spirit not the letter
```

#### 4. Update the Description

If a rule is routinely ignored in the same contexts, encode those violation signals in the description.

### Re-verify After Refactoring

Re-run the same scenarios. A resilient skill should now produce the correct choice and cite the updated guidance.

## Meta-Testing

If GREEN is still not working, ask the agent why it ignored the skill.

```markdown
You read the skill and still chose Option C.

How should that skill have been written differently to make it clear that Option A
was the only acceptable answer?
```

Possible outcomes:

1. The skill was clear and the agent ignored it. Strengthen foundational rules.
2. The skill should have said something more explicit. Add it.
3. The agent missed a section. Improve structure and prominence.

## When the Skill Is Bulletproof

Signs of success:

1. The agent chooses the correct option under strong pressure.
2. The agent cites the skill as justification.
3. The agent acknowledges the temptation and still complies.
4. Meta-testing confirms the skill was clear.

It is not bulletproof if the agent still finds new rationalizations, invents hybrid workarounds, or argues around the rule.

## Testing Checklist

**RED:**

- [ ] Created pressure scenarios with combined pressures
- [ ] Ran scenarios without the skill
- [ ] Documented failures and rationalizations verbatim

**GREEN:**

- [ ] Wrote the skill to address specific failures
- [ ] Ran scenarios with the skill
- [ ] Verified compliance

**REFACTOR:**

- [ ] Captured new rationalizations
- [ ] Added explicit counters
- [ ] Updated the rationalization table
- [ ] Updated the red flags list
- [ ] Re-tested until behavior held up
- [ ] Meta-tested for clarity

## Common Mistakes

**Writing the skill before testing:** you end up documenting what you assume matters instead of what actually fails.

**Weak test cases:** single-pressure scenarios are rarely enough.

**Not capturing exact failures:** vague summaries do not tell you what to fix.

**Vague fixes:** generic warnings do not stop specific rationalizations.

**Stopping after one pass:** passing once does not mean the skill is resilient.

## Quick Reference

| TDD phase    | Skill testing              | Success criteria                         |
| ------------ | -------------------------- | ---------------------------------------- |
| RED          | Run scenario without skill | Agent fails and reveals the real problem |
| Verify RED   | Capture exact wording      | Failures documented verbatim             |
| GREEN        | Write the skill            | Skill addresses real failures            |
| Verify GREEN | Re-test                    | Agent follows the rule under pressure    |
| REFACTOR     | Close loopholes            | Skill counters new rationalizations      |
| Stay GREEN   | Re-verify                  | Compliance remains after refactoring     |

## The Bottom Line

If you would not write code without tests, do not write skills without testing them on agents.
