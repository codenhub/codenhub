---
status: APPROVED
last_updated: 2026-10-31
scope: How to write a package's hand-authored public documentation.
---

# Writing public package docs

`docs/specs/packages-documentation.md` requires a package's public docs to give complete coverage and follow a reading path, and says they SHOULD have a playful voice. This guideline is about doing that well, which no checklist fully captures. It covers the hand-authored pages a consumer reads to learn the package. It does not cover a generated reference, which `docs/specs/packages-reference.md` governs, or `docs/internal/`, which stays for maintainers.

## Start from an inventory

Before writing, list what the docs owe the reader: each entrypoint and export, each option and default, each capability, constraint, failure, known limitation and workaround, each thing the package deliberately does not do, and each security, accessibility, and performance responsibility it leaves to the consumer. Pull from the source, the tests, `docs/internal/`, and the package's `AGENTS.md`. Tests are the most reliable list of edge cases a consumer can hit, and an `AGENTS.md` trap that a consumer could fall into needs a consumer-facing explanation too.

Then decide where each item is explained, and keep the inventory honest as the docs grow: when an item has no home, the docs are not finished. The inventory is a working aid. It does not need to be committed.

## Tell it as a story

A consumer should be able to read the docs in order and come out knowing the package, the way a good tutorial teaches a tool rather than a manual listing its buttons.

- **Open with the problem.** The index says what the package is for and what it saves the reader from doing by hand, before any API appears.
- **Order pages by need, not by module.** Put first what a new consumer needs first, then what they reach for next. Source file layout is the wrong order more often than not.
- **Carry a running example.** One small, realistic scenario that grows across pages, such as a login flow or a settings screen, connects the pages and shows how features combine. Introduce something new on each page instead of starting over.
- **Common case first, edge cases after.** Each page starts with the smallest example that works, then realistic use, then limits, failures, and workarounds. A reader who stops early has still learned something correct.
- **Hand off at the end.** Each page ends by saying where to go next and why.

## Explain, don't compress

The usual failure is a sentence that names five behaviors so each counts as mentioned. Unpack it. For each behavior, say what happens, why when the reason helps the reader predict related behavior, and what to do about it, with an example when it is not obvious.

Before, compliant but unusable:

> Invalid paths, duplicate structural patterns, duplicate or dangerous parameter names, query/hash content, backslashes, and dot segments throw.

After:

> `on()` checks each path when you register it, so a mistake fails at startup instead of on some unlucky click. These all throw:
>
> - Two routes with the same shape. `/users/:id` and `/users/:name` match exactly the same URLs, so the second could never win. Keep one of them.
> - A query or hash in the pattern. `/search?q=:term` throws: routes match the path only. Read the query from `match.searchParams` instead.
>
> …and so on for each case, with its fix.

Error and limitation sections get the same care. A consumer reading them is usually stuck, so give the cause and the way out, not just the condition.

## Voice

The docs are a knowledgeable friend explaining something they built: precise, a little dry, and happy to grin about the odd parts. Humor goes in the connective prose, such as introductions, transitions, and asides, where it rewards the reader without slowing them down.

The kind of thing that fits:

- "It needs a note? Then note it." — when an API does exactly what its name says.
- "Tokens expire, because security, duh." — teasing the domain, not the reader.
- "This is the boring part. It's also the part that pages you at 3 a.m., so stay with us."

Guardrails:

- **Aim jokes at the situation, the domain, or ourselves, never at the reader.** "Duh" about JWTs is fine; "duh" about someone not knowing something reads as contempt, and these docs assume a reader who does not know.
- **Keep the plain meaning recoverable.** Many readers are not native English speakers, and many read through a translator or an LLM. A pun can add to a sentence, but the sentence must still say the fact literally.
- **Keep it out of warnings, security notes, error explanations, and copyable code.** A reader in those places needs the fact, nothing else. Example code can use playful names in prose-only snippets, but code meant to be pasted uses realistic names.
- **One wink, not a stand-up set.** A light touch every few paragraphs is enough. If a joke needs explaining or has to be forced in, cut it.
