# AGENTS.md Quality Criteria

## Scoring Rubric

### 1. Commands and Workflows (20 points)

**20 points**: All essential commands documented with context

- Build, test, lint, and deploy commands are present when relevant
- Development workflow is clear
- Common operations are documented

**15 points**: Most commands are present, some context is missing

**10 points**: Basic commands only, little or no workflow guidance

**5 points**: Few commands, many missing

**0 points**: No commands documented

### 2. Architecture Clarity (20 points)

**20 points**: Clear codebase map

- Key directories are explained
- Module relationships are documented
- Entry points are identified
- Data flow is described where relevant

**15 points**: Good structure overview, minor gaps

**10 points**: Basic directory listing only

**5 points**: Vague or incomplete

**0 points**: No architecture info

### 3. Non-Obvious Patterns (15 points)

**15 points**: Gotchas and quirks are captured

- Known issues are documented
- Workarounds are explained
- Edge cases are noted
- Unusual patterns include a short explanation of why they exist

**10 points**: Some patterns are documented

**5 points**: Minimal pattern documentation

**0 points**: No patterns or gotchas

### 4. Conciseness (15 points)

**15 points**: Dense, valuable content

- No filler or obvious information
- Each line adds value
- No redundancy with other project docs unless the repetition is intentional and useful

**10 points**: Mostly concise, some padding

**5 points**: Verbose in places

**0 points**: Mostly filler or restates obvious code

### 5. Currency (15 points)

**15 points**: Reflects the current codebase

- Commands work as documented
- File references are accurate
- Stack and workflow details are current

**10 points**: Mostly current, minor staleness

**5 points**: Several outdated references

**0 points**: Severely outdated

### 6. Actionability (15 points)

**15 points**: Instructions are executable

- Commands can be copy-pasted
- Steps are concrete
- Paths are real
- Guidance tells the reader what to do, not just what exists

**10 points**: Mostly actionable

**5 points**: Some vague instructions

**0 points**: Vague or theoretical

## Assessment Process

1. Read the target `AGENTS.md` file completely.
2. Cross-check with the actual repository:
   - verify documented commands where practical
   - check that referenced files and directories exist
   - confirm architecture descriptions match the codebase
3. Score each criterion.
4. Calculate the total and assign a grade.
5. List specific issues found.
6. Propose concrete improvements.

## Red Flags

- Commands that would fail because of wrong paths, missing dependencies, or stale names
- References to deleted files or folders
- Outdated stack or workflow descriptions
- Generic template content that was never customized for the project
- Advice that is not specific to the repository
- Placeholder text such as `TODO` that was never resolved
- Duplicated guidance spread across multiple instruction files without a clear reason
