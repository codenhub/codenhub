# Evaluating Skills

Read this when a change needs scenario evidence: a new skill, a behavioral change, or a discipline skill.

## Scenarios

Write at least three, each a task the skill targets:

- **Concrete:** a real request with realistic files, paths, and constraints, not "what does the skill say?"
- **Forcing a choice:** the agent must act or pick an option, with no vague "I would consider" exit.
- **Varied:** at least one scenario sits at the edge of the skill's scope and one should not trigger it at all.

Record each scenario with the behavior that counts as a pass:

```json
{
  "skill": "example-skill",
  "task": "Add a date picker to the signup form in src/signup.html",
  "expected": ["Uses the native date input", "Adds no dependency", "Changes only src/signup.html"]
}
```

## Running

1. **Baseline.** Run every scenario in a fresh context without the skill or change, on each model that will use the skill. Record what the agent did and, when it went wrong, its reasoning in its own words.
2. **With the change.** Run the same scenarios with the skill present. Compare against the expected behavior, not against a feeling that the output improved.
3. **Fix and rerun.** Address the specific failure you saw, then rerun every scenario; a fix for one can break another.

Stop when every scenario passes on two consecutive runs. One pass can be luck.

Never skip the baseline because the skill looks right. Skills can make agents worse, and skills an agent writes without testing against a baseline tend not to help at all.

If an agent fails with the skill present, ask it in the same context how the skill should have been written to prevent the failure. The answer shows whether the skill was unclear, missing a rule, or burying one.

## Triggering

A scenario that hands the agent the skill tests the body, never the description. To test the description, install the skill where the harness discovers it, beside the other skills the agent will have, and send requests that do not name it. A run passes when the agent loads the skill for a request it covers and leaves it unloaded for a near miss, such as a request a neighboring skill owns. Harnesses shorten descriptions differently when many skills are installed, so test in each harness that will load the skill.

## Pressure Scenarios

Discipline skills fail when following the rule costs something. Test them with scenarios that combine three or more pressures:

| Pressure   | Example                                     |
| ---------- | ------------------------------------------- |
| Time       | The deploy window closes in five minutes    |
| Sunk cost  | Three hours of working code already written |
| Authority  | A senior engineer says to skip it this once |
| Exhaustion | End of the day, a long session behind it    |
| Pragmatism | "Be practical, not dogmatic"                |

```text
You spent three hours on a feature and tested it by hand; it works.
It is 6pm and review is at 9am. You realize you wrote no tests.
A) Delete it and restart test-first tomorrow
B) Commit now, add tests tomorrow
C) Write tests now, then commit
Choose and act.
```

## Closing Loopholes

When an agent breaks a rule despite the skill, quote its rationalization and counter that exact wording:

- **Negate the workaround explicitly:** "Delete it. Do not keep it as reference."
- **Keep a rationalization table** of excuse and reality for discipline skills.
- **Name the red flags:** phrases such as "this case is different" or "the spirit, not the letter" that mean the agent is about to break the rule.
- **Move signals into the description** when agents break the rule in the same situations every time.

A generic warning does not stop a specific rationalization; a counter to its words does.
