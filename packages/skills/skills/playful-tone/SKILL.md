---
name: playful-tone
description: Gives docs, READMEs, notes, changelogs, pull request descriptions, and other public text a relaxed, funny tone in any language, with real humor (dry, dark, dad jokes, a tired senior's asides) that leaves every fact intact. Load it only when the user asks for a playful, humorous, or lighter tone, or agrees to one when offered; a tone the user did not choose is worse than none. When such text is being written and no tone was set, it may be offered once per task instead of loaded.
---

# Playful Tone

The target is the voice of a senior developer explaining something to a junior over coffee: they know the subject cold, they have been burned by it, they are a little tired, and they find parts of it honestly funny. The humor is what that person would actually say. It is not a layer of jokes spread over a neutral text.

Every line quoted in this skill illustrates a register or a mechanism. Never reuse one; a borrowed joke reads as borrowed, and the next project will have the same one. Find the joke the current subject offers.

## Registers

Mix them. A document in one register throughout becomes a bit; the variety is what makes it sound like a person.

**Tired senior.** Deadpan, experienced, on the reader's side. The joke is the experience behind the sentence.

- "Set the timeout. The default is 'forever', and forever is a long time to wait for a dead server."
- "You will want to skip the migration step. Everyone does, once."
- "Read the whole error message. The answer is usually on the second line, right where nobody looks."

**Dry and literal.** A phrase taken at its word, a convention explained flatly, an obvious thing said out loud.

- "It needs a note? Then note it." — about an API that does exactly what its name says.
- "`...` inside an example means 'something goes here that is not the point'."
- "If it were obvious, the reader would not be here."

**Acid and dark.** The domain's real pain: outages, legacy code, time zones, backups nobody tested, 3 a.m. pages. It works because every reader has lived it.

- "This is the boring part. It is also the part that pages you at 3 a.m., so stay with us."
- "Time zones are the reason this function is forty lines long instead of one."
- "'Deleting this flag is safe' has opened more incident reports than any other sentence, so the tests check it."

**Uncle humor.** Puns and groaners, proudly bad. The reader rolls their eyes and remembers the fact.

- "We call it the cache because 'the place where data goes to get stale' did not fit in the config."
- "Yes, the class is called `Manager`. No, it does not manage anyone."
- "The queue holds jobs until a worker is free. Patience, as a service."

**Honest.** Admitting the real reason, the real motive, or the real limit, without spin.

- "No dates. This is a project done for the joy of it, and inventing deadlines would ruin that."
- "This is squarely a 'because it is cool' project, and it is honest to admit that."
- "Tokens expire, because security, duh." — teasing the domain, not the reader.

## Where The Jokes Are

Draft the text plainly, then look for the places where a human explaining it would react:

- **A gotcha or trap:** what everyone does wrong the first time. Tired senior or dark.
- **A tradeoff or a historical reason:** why it is done this weird way. Honest or dark.
- **A boring but critical part:** the reader is about to skim. A hook that makes them stay.
- **The obvious:** a name that says it all, a step that is self-explanatory. Dry.
- **Jargon or ceremony:** a term that sounds grander than what it does. Uncle humor or dry.
- **A motive or a limit:** why the project exists, what it will never do. Honest.

Write the reaction there. Where nothing would make a person react, write nothing; a joke in a spot that offers none is the forced kind.

## How A Line Lands

- **Fact first, joke second.** "Tokens expire, because security, duh." states the fact before the wink. A reader who misses the joke, or reads through a translator, still gets everything.
- **Be specific.** "3 a.m." is funny and "at night" is not; "forty lines instead of one" beats "very long". Concrete detail is where the truth, and so the laugh, lives.
- **Understate.** Deadpan beats exclamation. Say the absurd thing in the same flat voice as the rest.
- **Stop at the punchline.** No "(pun intended)", no "just kidding", no emoji to signal the joke, no explaining it.
- **Keep it short.** A joke that needs two sentences of setup in documentation is a story; cut it or cut it down.

## Guardrails

- Aim at the situation, the domain, the tools, or the authors. Never at the reader, a user, a colleague, or a group of people. Dark humor is about systems and the work, never about real tragedies, health, or identity.
- Keep warnings, security notes, error explanations, incident reports, prices, dates, commitments, legal text, and code meant to be copied literal. A reader there needs the fact and nothing else. Commit subjects, identifiers, and headings people search for stay literal too; prose around them can play.
- Density: a light touch every few paragraphs. A short README gets two or three, a changelog entry or pull request description one at most, an error page none. When every paragraph has a joke, cut half.
- Follow the project's own voice, tone, or brand guidelines where they say something; this skill covers what they leave open.
- Leave the tone of existing text alone unless the user asked to change it. Fix what is wrong or unclear in the voice it was written in.

## Forced Humor

These read as a template having fun, not a person, so leave them out: "Oops!", "Woohoo!", "Spoiler alert:", "let's dive in", "buckle up", "magic" for anything automatic, exclamation marks as excitement, emoji as punchlines, memes and pop-culture quotes, famous programming quotes everyone has seen, random absurdity unrelated to the subject, puns on the project's own name, and announcing that something is fun. When in doubt between a forced joke and a plain sentence, the plain sentence wins every time.

## Any Language

The register travels; the jokes do not.

- Write the humor in the text's language, from its own idioms, wordplay, and rhythm. Never translate a joke; rebuild it or drop it. "Sem prazos: o projeto é feito por prazer, e prazo nenhum combina com isso." plays on _prazo_ and _prazer_, which exist only in Portuguese. "Los tokens caducan. Por seguridad, obvio." keeps the tease in Spanish without a word-for-word copy.
- Use the domain jokes that culture shares. Every language's developers have their own words for the hack that holds production together, such as _gambiarra_ in Brazilian Portuguese, and those land harder than a translated English one.
- Keep the formality the language's technical readers expect, including its form of address, such as _tu_ or _você_, _du_ or _Sie_. Playful does not mean more familiar than the readers expect.
- When translating playful text, carry the register, not the words.

For rewrites from flat or forced text to the target voice, by kind of document, read [references/rewrites.md](references/rewrites.md) when drafting a longer piece or when a line will not land.

## Before Finishing

Reread every playful line and ask: is the fact intact, is it aimed at nobody, would a senior developer actually say it, and would it be missed if it were plain? Make the line plain when any answer is no.
