---
status: APPROVED
last_updated: 2026-11-08
scope: How to write a package's hand-authored public documentation.
---

# Writing public package docs

`docs/specs/packages-documentation.md` requires a package's public docs to give complete coverage and follow a reading path, and says they SHOULD have a playful voice. The [Writing](documentation.md#writing) section of the documentation guidelines is how to do that: start from an inventory, tell it as a story, explain rather than compress, and use the voice and its guardrails. This guideline adds only what is specific to a package's docs.

It covers the hand-authored pages a consumer reads to learn the package. It does not cover a generated reference, which `docs/specs/packages-reference.md` governs, or `docs/internal/`, which stays for maintainers.

- **The inventory** lists each entrypoint and export, and each security, accessibility, and performance responsibility the package leaves to the consumer. It pulls from the package's `docs/internal/` and its `AGENTS.md` as well as the source and the tests. An `AGENTS.md` trap that a consumer could fall into needs a consumer-facing explanation too.
- **The index opens with the problem**: what the package is for and what it saves the reader from doing by hand, before any API appears.
- **The running example** is a small, realistic scenario from an app that uses the package, such as a login flow or a settings screen, grown across the pages.
- **The voice is the playful one** the documentation guidelines give documents that teach, since a package's public docs are one. Warnings, security notes, error explanations, and copyable code stay plain.
