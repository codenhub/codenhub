# Persuasion Principles for Skill Design

## Contents

- Overview
- The Seven Principles
- Principle Combinations by Skill Type
- Why This Works
- Ethical Use
- Research Citations
- Quick Reference

## Overview

Language models respond to many of the same persuasion principles that influence people. Understanding that helps you design skills that hold up under pressure.

**Research foundation:** Meincke et al. (2025) tested seven persuasion principles across 28,000 model conversations and found that persuasion techniques more than doubled compliance rates.

## The Seven Principles

### 1. Authority

**What it is:** deference to expertise, credentials, or official rules.

**How it works in skills:**

- Imperative language such as `must`, `never`, and `always`
- Non-negotiable framing
- Less room for rationalization

**When to use:**

- Discipline-enforcing skills
- Safety-critical practices
- Established best practices

**Example:**

```markdown
Write code before test? Delete it. Start over. No exceptions.
```

### 2. Commitment

**What it is:** consistency with prior actions or explicit commitments.

**How it works in skills:**

- Require explicit announcements
- Force clear choices
- Use progress tracking for multi-step work

**When to use:**

- Multi-step workflows
- Skills that are often ignored mid-process
- Accountability mechanisms

### 3. Scarcity

**What it is:** urgency created by timing or sequence.

**How it works in skills:**

- "Before proceeding"
- "Immediately after X"
- Prevents procrastination

**When to use:**

- Immediate verification requirements
- Time-sensitive workflows
- Anything often deferred until it is too late

### 4. Social Proof

**What it is:** conformity to what is treated as normal practice.

**How it works in skills:**

- Universal framing such as `every time` or `always`
- Naming common failure modes explicitly
- Establishing the practice as standard behavior

### 5. Unity

**What it is:** shared identity and shared goals.

**How it works in skills:**

- Collaborative language
- Shared responsibility for quality
- Encourages honest technical judgment

### 6. Reciprocity

**What it is:** pressure to return perceived benefits.

**How it works:**

- Rarely needed in skill writing
- Easy to overdo

### 7. Liking

**What it is:** preference for cooperating with those we like.

**How it works:**

- Avoid for discipline enforcement
- Can encourage sycophancy instead of rigor

## Principle Combinations by Skill Type

| Skill type             | Use                                   | Avoid                  |
| ---------------------- | ------------------------------------- | ---------------------- |
| Discipline-enforcing   | Authority + commitment + social proof | Liking, reciprocity    |
| Guidance or technique  | Moderate authority + unity            | Heavy authority        |
| Collaborative workflow | Unity + commitment                    | Excess authority       |
| Reference              | Clarity only                          | Unnecessary persuasion |

## Why This Works

**Bright-line rules reduce rationalization:**

- `must` reduces decision fatigue
- absolute language removes exception-hunting
- explicit anti-rationalization counters close loopholes

**Implementation intentions create automatic behavior:**

- clear triggers plus required actions improve follow-through
- `when X, do Y` is stronger than vague guidance
- less cognitive load means better compliance

**Models learn these patterns from human language:**

- authority language is often followed by compliance
- commitment sequences are common in training data
- social proof establishes norms quickly

## Ethical Use

**Legitimate:**

- ensuring critical practices are followed
- preventing predictable failures
- making documentation more reliable

**Illegitimate:**

- manipulation for personal gain
- false urgency
- guilt-driven compliance

Use the technique only when it serves the partner's genuine interests.

## Research Citations

**Cialdini, R. B. (2021).** _Influence: The Psychology of Persuasion (New and Expanded)._ Harper Business.

**Meincke, L., Shapiro, D., Duckworth, A. L., Mollick, E., Mollick, L., & Cialdini, R. (2025).** _Call Me A Jerk: Persuading AI to Comply with Objectionable Requests._ University of Pennsylvania.

## Quick Reference

When designing a skill, ask:

1. What type of skill is this?
2. What behavior needs to change?
3. Which principle fits that behavior?
4. Am I using more persuasion than necessary?
5. Would this still be justified if the partner understood it fully?
