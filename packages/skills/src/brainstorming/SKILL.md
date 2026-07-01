---
name: brainstorming
description: "Use when the work needs collaborative design before implementation, especially for new features, behavior changes, or unclear requirements. Explores user intent, requirements, and design before implementation."
metadata:
  short-description: Brainstorm ideas into approved designs
---

# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs through natural collaborative dialogue. Start by understanding the current project context, then ask simple, direct questions to refine the idea.

Once you understand what you're building, present the design and get user approval before any implementation action. Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. Design approval does not approve documentation, planning, or implementation. After approval, recommend writing a concise spec when formalizing the decisions would help preserve context, coordinate work, or guide implementation, but do not require one. If the user explicitly wants brainstorming only, deferred documentation, or direct implementation, follow that intent. If the next step is unclear, ask one short question such as `Do you want a short spec first, or should I proceed to the change?` instead of assuming a handoff.

## Anti-Pattern: "This Is Too Simple To Need A Design"

Do not skip design just because something looks simple if there is any meaningful choice about behavior, interface, structure, or constraints.

For trivial, low-risk work with one obvious shape, keep the design lightweight: confirm the goal, state the intended approach briefly, and get acknowledgement before moving on. If you are unsure whether the work is trivial, treat it as non-trivial.

## Checklist

Use these stages as the default flow. For complex work, cover them all. For simple work, collapse them into the lightest version that still confirms the design before implementation. Track them explicitly when the environment supports task tracking:

1. **Explore project context** - inspect enough of the project to understand current patterns and constraints; if the request is obviously too large for one coherent design, do only enough to confirm that and decompose first
2. **Ask clarifying questions** - keep them simple and direct; group closely related easy questions when they can be answered together; separate questions that need discussion
3. **Propose options** - compare 2-3 approaches when there are meaningful choices; otherwise state the single obvious approach and why it is sufficient
4. **Present design** - for complex work, present the design in sections, get a response on each section, revisit any deferred or partial approvals, then give a short summary of the full design and get one final approval; for simple work, a single concise design and one approval is enough
5. **Transition or stop** - recommend a concise spec when formalizing the approved design would help; if the user wants to proceed directly, complete brainstorming and hand off to implementation outside this skill; if the user explicitly wants brainstorming only, stop after the approved design; if the next step is unclear, ask one short question

## Tool Compatibility

- Keep instructions tool-agnostic and avoid provider-specific wording.
- When behavior differs across tools, resolve conflicts in this order: OpenCode > Claude Code > Codex CLI > Gemini CLI.

## Process Flow

```text
Explore project context
  -> If the request is too large for one coherent design: decompose it immediately, recommend the first sub-project, get agreement on that slice, then continue
  -> Ask simple, direct questions
  -> Propose options when there are real choices
  -> Present design
     -> complex work: section response -> revisit deferred/partial items -> final summary -> final approval
     -> simple work: concise design -> approval
  -> Final design approved?
     -> no: revise and continue
     -> yes + formal documentation would help: recommend a concise spec, then follow the user's choice
     -> yes + wants to proceed directly: brainstorming complete; end this skill and hand off to the implementation phase
     -> yes + explicitly wants brainstorming only: stop after the approved design
     -> yes + next step unclear: ask one short question
```

Do NOT invoke `frontend-design` or any other implementation skill from brainstorming. If the user wants to proceed directly, finish brainstorming first, then let implementation happen as the next phase outside this skill.

Recommend a concise spec only when the approved design should be formalized or carried forward. If the user explicitly wants to stop at brainstorming, defer documentation, or proceed directly to the change, do not force a spec. When the user's intent is unclear after final design approval, ask one short question such as `Do you want a short spec first, or should I proceed to the change?`.

## The Process

**Understanding the idea:**

- Inspect enough of the current project state first: relevant files, docs, or recent commits when helpful. If the request is obviously too large for one coherent design, do only enough inspection to confirm that and move straight to decomposition.
- Decide whether the request needs the full brainstorming flow or a lightweight design confirmation. Use the full flow for new functionality, behavior changes, unclear requirements, multiple reasonable approaches, or work that spans multiple components. For trivial, low-risk, self-evident changes with one obvious path, keep the design brief but still confirm it before moving on. If unsure, use the full flow.
- Before asking detailed questions, assess scope. If the request describes multiple independent subsystems, for example "build a platform with chat, file storage, billing, and analytics", flag this immediately. Do not spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for one coherent design, decompose it into sub-projects, recommend the first sub-project to tackle, and get agreement on that slice before going deeper. Then brainstorm that sub-project through the normal design flow. Each sub-project can get its own concise spec when formalizing decisions would help, but follow the user's intent for the handoff.
- For appropriately scoped projects, ask simple, direct questions to refine the idea.
- Group closely related easy questions when the user can answer them together. If a question is complex, high-impact, or likely to need back-and-forth, ask it by itself.
- Prefer multiple choice questions when possible, but open-ended is fine too.
- Focus on understanding: purpose, constraints, success criteria.

**Exploring approaches:**

- When there are materially different reasonable options, propose 2-3 different approaches with trade-offs.
- For trivial or single-path work, state the chosen approach and why it is sufficient.
- Present options conversationally with your recommendation and reasoning.
- Lead with your recommended option and explain why.

**Presenting the design:**

- Once you believe you understand what you're building, present the design.
- For complex work with multiple decisions or issues, split the design into sections. Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced.
- Ask after each section whether it looks right so far.
- Partial approvals and deferrals are fine, but track every unresolved point and revisit it before the final summary.
- After the last section, give a short summary of the whole design and ask for one final approval. Do not treat the design as fully approved until this final approval happens.
- For simple, obvious work, skip the sectioned flow and present one concise design for approval.
- For complex work, cover architecture, components, data flow, error handling, and testing. For simple work, cover only the parts that matter.
- Be ready to go back and clarify if something does not make sense.

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently.
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with. You reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that is often a signal that it is doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work, for example a file that has grown too large, unclear boundaries, or tangled responsibilities, include targeted improvements as part of the design, the way a good developer improves code they are working in.
- Do not propose unrelated refactoring. Stay focused on what serves the current goal.

## After the Design

**Documentation:**

- Recommend writing a concise spec to formalize the validated design when the decisions should be preserved, shared, or carried forward.
- Do not force a spec. If the user wants brainstorming only, deferred documentation, or direct implementation, follow that intent.
- If the user wants to keep going but it is unclear whether they want a spec, more planning, or direct implementation, ask `Do you want a short spec first, or should I proceed to the change?`.

## Key Principles

- **Simple questions first** - Ask simple, direct questions. Group closely related easy questions when useful, and separate questions that need discussion.
- **Multiple choice preferred** - Easier to answer than open-ended when possible.
- **YAGNI ruthlessly** - Remove unnecessary features from all designs.
- **Explore alternatives** - Propose 2-3 approaches when there are real choices; otherwise state the single obvious approach.
- **Incremental validation** - For complex work, get section responses, revisit any deferred or partial items, and always finish with final whole-design approval. For simple work, one approval is enough.
- **Be flexible** - Go back and clarify when something does not make sense.
