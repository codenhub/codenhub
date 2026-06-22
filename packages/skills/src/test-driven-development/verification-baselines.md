# Verification Baselines and Flaky Triage

Load this reference when baseline failures exist before coding or verification
fails during VERIFY GREEN.

## Core Rule

Compare like-for-like test results using identical commands. Never re-label new
or drifted failures as "known flaky."

## 1) Capture Baseline Before Coding

- run the exact verification commands you plan to use after changes
- record failing test IDs and error signatures
- keep enough evidence to compare later (command + failing IDs + signature text)

## 2) Compare Post-Change Results

Run the same commands and classify each failure:

- **baseline match:** test ID and error signature match baseline evidence
  exactly; document and continue
- **new or drifted failure:** new failing test ID or changed signature; treat as
  regression and fix before proceeding
- **infrastructure failure:** runner outage, dependency timeout, or environment
  instability; re-run once, then if still failing and clearly unrelated to
  changed paths, document evidence and ask the user before completion

## 3) Guardrails

- use identical verification commands for baseline and post-change comparison
- do not downgrade new failures to "already flaky"
- if your change touched a flaky test, stabilize it now or quarantine it with a
  documented follow-up issue before completion
- if you must change verification commands, recapture baseline evidence first

## Bottom Line

```text
Baseline evidence protects trust in GREEN. Same command, same comparison,
no relabeling.
```
