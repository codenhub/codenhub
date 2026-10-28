---
name: naming
description: Generates, researches, and judges names for anything people will say, type, or recognize, such as products, apps, companies, brands, agents, AI models, libraries, packages, CLIs, tools, projects, features, and codenames. Use when asked to name or rename something, suggest or brainstorm names, decide whether a name is good, compare candidate names, check a name for collisions or availability, or design a family of related names. Also covers naming code identifiers such as variables, functions, and modules.
---

# Naming

A great name is a compressed story. It points at one true thing about what it names, through a word that is short, sayable, and ownable, so that hearing it once is enough to remember it and connect it to the thing. Docker is a dock worker who loads containers. Helium is the lightest noble gas, for a lightweight browser. Haiku, Sonnet, and Opus run from a three-line poem to a 14-line poem to a major work, so the name tells you the model's size. Every recommendation this skill produces has to be able to tell its story in one sentence.

The default failures this skill exists to stop:

- **Description mush.** `TaskFlowManager`, `CodeAssist Pro`, `SmartSync`. It describes the thing, can't be owned, and everyone forgets it.
- **Cliché mythology.** Atlas, Apollo, Hermes, Phoenix, Titan, Orion, Nexus, Nova, Zenith, Aether, Vertex, Prism, Lumina, Echo, Spark, Pulse, Forge, Sentinel. Hundreds of products already use these. Use one only when its story fits better than anything else and the field isn't already crowded with it, and say why.
- **SaaS affixes.** `-ify`, `-ly`, `-hub`, `-io`, `-flow`, `-stack`, `-base`, `-AI`, `Get-`, `Try-`, a dropped final vowel. They make a name look generic. They don't make it distinctive.
- **Invented facts.** A myth, etymology, or translation stated from memory and wrong. Verify every origin story before you rest a recommendation on it.
- **An unranked list.** Forty names with no pick and no reasons. The user needs a recommendation, a shortlist, and the reasoning behind each.

## Brand Names Or Identifiers

First decide which kind of name this is.

- **Brand names** are names people say out loud, recommend, search for, and recognize: products, apps, companies, agents, models, published libraries and packages, CLIs, services with their own identity, and codenames. The rest of this skill covers these.
- **Identifiers** are names read only inside code: variables, functions, classes, files, internal modules, database columns. Name them literally. Say what the thing is or does in the domain's own vocabulary, follow the project's conventions, use one term per concept, and match length to scope: short names for small scopes, full words for wide ones. Leave out metaphor and wordplay. A function called `heron()` makes every reader stop and look it up.

Some things need both. A package can have a brand name (`Zod`, `Vite`) while the code inside it uses literal identifiers. If you can't tell which kind the user wants, ask.

## Workflow

### 1. Understand The Thing

Before generating anything, find out:

- **What it does**, in one plain sentence, and **how it works**, since mechanism is often where the best metaphor is (Docker, Tor's onion layers).
- **Who uses it** and the languages and markets they work in.
- **The feeling or promise.** Fast, calm, powerful, playful, trustworthy, rebellious. Pick one or two words.
- **The essence.** The single attribute that would be true of this thing and not of its competitors.
- **The category's names.** Look at what competitors are called, so the new name stands apart from them.
- **Constraints.** Package registry, domain, maximum length, an existing family or brand to fit, naming guidelines already on record, and names the user already likes or has ruled out.

In a codebase, read the README, the package manifest, existing names, and any branding or naming docs before asking anything. Ask the user only about what the material doesn't answer and what would change the result. Taste belongs to the user: if they've named things they like, treat those as the strongest signal.

### 2. Generate Broadly

Write down the attributes from step 1: function, mechanism, feeling, promise, audience. Then work each one through several source lanes:

- **Myth and religion.** Figures, creatures, places, and objects from Greek, Roman, Norse, Egyptian, Mesopotamian, Hindu, Buddhist, Chinese, Japanese, Celtic, Slavic, Yoruba, Polynesian, Mesoamerican, Jewish, Christian, and Islamic tradition. Go for the specific story that matches (Ariadne's thread, Huginn the raven of thought, the Golem), not the most famous god.
- **History.** People (Claude, widely read as a nod to Claude Shannon; Ada; Turing; Hypatia), cities and empires (Alexandria, Samarkand, Byzantium), and artifacts (Rosetta, Antikythera, Quipu, Codex).
- **Science and phenomena.** Elements, minerals, particles, astronomy, weather, biology, mathematics, and named effects (Helium, Obsidian, Googol, Mycelium, Doppler).
- **The field itself.** Objects, tools, trades, places, and actions directly related to the thing (Cursor, Docker, Blender, Steam).
- **Language roots.** Latin, Greek, Sanskrit, Japanese, Romance-language, and other words whose meaning fits (Manus is Latin for "hand", Vista is "view", Meta is "beyond").
- **Arts and culture.** Musical and literary forms, archetypes, and roles (Opus, Sonnet, Rockstar).
- **Nature.** Animals, plants, and landscapes whose behavior or character matches the thing.
- **Coined forms.** Blends (Netflix, Pinterest), misspellings or truncations of a meaningful word (Google from googol), and invented words built from alternating consonants and vowels (Kodak, Xano).

When the user brings names to judge, compare, or check, start at step 3 with their names, and generate new ones only if they ask or every name fails. Otherwise, generate 30 to 60 candidates across at least four lanes before judging any of them. Breadth across lanes beats synonyms within one lane: everyday words from the field are the easiest to think of and the most often taken, so if most of your pool comes from one lane, generate more in the others before moving on. For seeds, techniques, and the cautions that go with each lane, read [references/sources.md](references/sources.md).

### 3. Research

Do this for every name you will present, the pick and each alternative, and for any candidate you're unsure about:

- **Verify the meaning.** Confirm the myth, etymology, or translation, and the pronunciation of any existing word you use, from a reliable source before presenting the name, whether as the pick or an alternative. For a coined name, give the pronunciation you intend and label it as proposed. If you can't confirm a story, drop the candidate or list it under rejected names with "unverified" as the reason.
- **Check collisions.** Search the web for the name together with the category's general term, not only your niche: "docket task queue" finds a Python task queue named Docket that "docket postgres queue" misses. A product with the same name and purpose in another language ecosystem or country still collides. Check the registry the thing will ship in (npm, PyPI, crates.io, app stores, and so on), GitHub, and the obvious domains. Record each collision's purpose, prominence, and evidence of current activity or dormancy, with sources, then apply the collision gate in step 4. Missing evidence leaves activity unresolved and does not qualify a candidate for the dormant-project exception.
- **Check other languages.** Look up the name, and words that sound like it, in the audience's major languages, including slang. Mist is manure in German. A name that's harmless in English can be crude, sacred, or comical somewhere else.
- **Flag trademark risk.** Note obvious registered marks in the same class. This isn't legal clearance, and say so when the stakes are commercial.

If you can't search the web or query registries, say exactly which checks weren't done instead of implying the name is free.

### 4. Screen And Rank

Cut any candidate that fails a gate:

- **Collision.** A known product in the same or an adjacent field already has the name. The exception is a small dormant project: disclose it, verify that the intended registry identifier is available when one is needed, and explain why confusion is unlikely before keeping the candidate. Active or famous products do not qualify for the exception. Dormancy alone does not establish availability or legal clearance. When activity or confusion remains unresolved, treat the collision as an unresolved doubt under the rule below.
- **Say-and-spell.** Someone who hears it once can't type it correctly, or someone who reads it once can't say it.
- **Bad meaning.** It's crude, offensive, or ridiculous in a major language of the audience.
- **Length.** For a brand, more than three syllables or about ten letters needs a strong reason.
- **No story.** You can't say in one sentence why this name fits this thing.

The recommended name passes every gate you could check. A gate you couldn't check, such as a registry you couldn't query, is neither a pass nor a miss: name it as unchecked, and don't imply the name is available or cleared. A concrete doubt your research turned up and couldn't resolve, such as a dictionary listing a possible slur, counts as a miss until someone resolves it. A mitigation, such as registering a likely misspelling, reduces the harm of a miss but doesn't make it a pass, since the owner pays for the miss every time the name is said. A strong candidate that misses one gate narrowly can appear only as an alternative, with the miss and its mitigation named.

Rank the survivors by these strengths, as judgments rather than added-up scores:

- **Fit.** How directly and truly the story maps to the essence. A name that's exactly right for one attribute beats one that's vaguely right for all of them.
- **Distinctiveness.** It stands out in its category. A common word used in an unexpected field (Apple in computers, Notion in software) is distinctive. The same word in its literal field isn't.
- **Sound.** It's pleasant and has the right energy when said out loud. Use the sound guidance below.
- **Reach across languages.** It's easy to say and spell for the intended audience.
- **Brandability.** It suggests a mark or image (an animal, an object, a strong initial letter), and it can grow into a family, a verb, or sub-products.

### 5. Present

Lead with the recommendation, then two to four alternatives that take meaningfully different directions, ideally from different lanes, not variations of the pick. Present only names you put through step 3. A candidate you didn't verify or check belongs under rejected names, or in a list for the next round, not among the alternatives. For each, give:

- the name and its pronunciation, when that isn't obvious;
- its origin, verified, in one line;
- why it fits this thing, as a one-sentence story;
- risks, including the weaker sides of its sound and its reach across languages;
- what you checked for collisions and availability and what you found, with the checks you couldn't run named as unchecked.

Then list notable rejected candidates with a reason for each in a few words, so the user can see the search and steer it. Ask what they like or dislike, and in the next round lean toward the lanes and sounds they respond to.

Example of one finalist (illustrative; re-run the checks for real use):

> **Escrow** (ES-kroh), for a Postgres job queue that enqueues a job only if the app's transaction commits. Origin: from Anglo-French _escroue_, a scroll or deed; in law, something a third party holds and releases only once a condition is met. Fit: the job is held and released to workers only if the transaction commits, the one promise a separate queue can't make. Sound: two syllables, one common spelling, and it works as a verb ("escrow a job"). Risks: searches will mix in payment and fintech results; non-native English speakers may not know the word. Checked: no job-queue library uses the name; npm `escrow` is an empty placeholder, so it would ship scoped; domains and trademarks weren't checked.

## Sound

These effects are tendencies documented across languages, not laws. Use them to match the name to the feeling from step 1:

- Front vowels (the short "e" in Zed, the "i" in Figma) suggest small, quick, light, and precise. Back vowels (Opus, Apolo, Docker) suggest large, deep, steady, and powerful.
- Hard stops (k, t, p, b, d, g) and the letters z and x feel sharp, fast, and punchy, as in Docker, Zed, Xano, and Tor. Liquids and nasals (l, m, n, r) and soft sibilants feel smooth and calm, as in Notion, Zen, and Manus.
- Names built from alternating consonant and vowel syllables (A-po-lo, Ma-nus, Xa-no, Ge-mi-ni) travel well across languages. Consonant clusters (str, thr), "th", the w/v contrast, silent letters, and dropped vowels (Flickr, Tumblr) cause misspelling and mispronunciation outside English.
- A name gets stuck in memory through rhythm and repetition (YouTube, Coca-Cola), a strong initial letter, or a single surprising sound.

## Families And Renames

- **Families.** When names will multiply, such as model sizes, product tiers, releases, or sibling packages, choose a system with an order built into it, such as size (Haiku, Sonnet, Opus), the alphabet, or a numbered sequence. Then each new name explains itself. Members must be hard to confuse with one another in speech and in writing; Violin and Viola fail that test.
- **Renames.** Renaming something already published or depended on changes public surface: imports, URLs, package names, search results, and what people remember. Present the rename as a decision with its migration cost, and get approval before changing anything. In a codebase, record the decision where the project records decisions.
