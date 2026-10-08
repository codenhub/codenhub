---
name: brainstorming
description: "Use when the work needs collaborative design before implementation, especially for new features, behavior changes, or unclear requirements. Explores user intent, requirements, and design before implementation."
metadata:
  short-description: Brainstorm ideas into approved designs
---

# Brainstorming Ideas Into Designs

Turn ideas into designs through collaborative dialogue: understand the project, ask simple, direct questions, then present a design and get it approved.

Do not invoke any implementation skill, write code, scaffold a project, or take any other implementation action until the user has approved a design. Design approval does not approve documentation, planning, or implementation; see After the Design for the handoff.

## Scale

Use the full flow for new functionality, behavior changes, unclear requirements, several reasonable approaches, or work spanning several components. If unsure, use the full flow.

For trivial, low-risk work with one obvious shape, keep it light: confirm the goal, state the approach briefly, and get acknowledgement before moving on. Looking simple is not a reason to skip design when there is any meaningful choice about behavior, interface, structure, or constraints.

## Flow

Track these stages when the environment supports task tracking.

1. **Explore the project.** Inspect enough of it to understand current patterns and constraints: relevant files, docs, or recent commits. If the request describes several independent subsystems, such as "a platform with chat, file storage, billing, and analytics", inspect only enough to confirm that, then decompose: split it into sub-projects, recommend the first, get agreement on that slice, and run this flow on it. Do not refine details of a project that needs decomposing first.
2. **Ask questions.** Focus on purpose, constraints, and success criteria. Prefer multiple choice. Group closely related easy questions; ask a complex, high-impact, or contested one by itself.
3. **Propose options.** When there are materially different reasonable approaches, present 2-3 with their trade-offs, leading with your recommendation and why. Otherwise state the single approach and why it is sufficient.
4. **Present the design.** Simple work: one concise design, one approval. Complex work: present it in sections scaled to their complexity, from a few sentences up to 200-300 words, and ask after each whether it looks right. Track every partial approval and deferral and revisit it, then give a short summary of the whole design and ask for one final approval. The design is not approved until that final approval. Cover architecture, components, data flow, error handling, and testing for complex work; only the parts that matter for simple work.
5. **Revise or hand off.** If the user does not approve, revise and continue; go back and clarify whenever something does not make sense. Once approved, follow After the Design.

## Design Content

- Remove unnecessary features from every design.
- Split the system into units with one clear purpose each. For each unit, answer what it does, how it is used, and what it depends on. If a unit cannot be understood without reading its internals, or its internals cannot change without breaking consumers, the boundaries need work.
- In an existing codebase, follow its patterns. Where existing code has problems that affect this work, such as a file that has grown too large or tangled responsibilities, include targeted improvements in the design. Do not propose unrelated refactoring.

## After the Design

- Recommend a concise spec when the approved design should be preserved, shared, or carried forward. Never force one.
- Wherever the design is kept, keep each choice with its reason, and with the alternatives rejected when materially different options were considered. A later reader who sees only the choice reopens it.
- If the user wants brainstorming only, stop after the approved design.
- If the user wants to proceed directly, brainstorming is complete; implementation happens outside this skill.
- If the next step is unclear, ask: `Do you want a short spec first, or should I proceed to the change?`
