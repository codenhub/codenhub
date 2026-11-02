# Rewrites

Each entry shows a flat or forced draft, the rewrite, and why it works. The rewrites illustrate a move; do not reuse them.

## README Introduction

- Flat: "This library provides utilities for parsing dates."
- Forced: "Dates got you down? 😩 Say hello to your new best friend! 🎉"
- Rewrite: "This library parses dates. It sounds like a weekend project, and it would be one if time zones, leap seconds, and the year 2038 did not exist."
- Why: the fact comes first, and the joke is the domain's real pain, in specifics.

## Project Motive

- Flat: "This project was created as an experiment."
- Forced: "Why? Because we can! 🚀"
- Rewrite: "There is no business case. It is an excuse to find out how far a terminal renderer can go before someone asks what it is for."
- Why: honest about the motive, flat in delivery.

## Configuration Option

- Flat: "`retries` sets the number of retry attempts. Default: 0."
- Forced: "`retries`: because if at first you don't succeed... 😉"
- Rewrite: "`retries` sets how many times a failed request is tried again. The default is 0, on the theory that a server that failed once deserves the benefit of the doubt exactly zero more times."
- Why: the literal sentence is complete; the aside teases the default, not the reader.

## Gotcha

- Flat: "Note: the cache is not cleared on deploy."
- Rewrite: "The cache survives deploys. This is a feature right up until you ship a fix and keep serving the bug for an hour."
- Why: tired senior; describes the exact way the reader will get burned.

## Boring But Critical Section

- Flat: "This section describes the backup configuration."
- Rewrite: "Backups. Nobody reads this section until the day they need it, and on that day it is too late to read it."
- Why: a hook for a section that gets skimmed, from the dark register.

## Obvious API

- Flat: "`close()` closes the connection."
- Rewrite: "`close()` closes the connection. No surprises here; enjoy it, the next section has plenty."
- Why: dry, and it sets up what follows.

## Changelog Entry

- Flat: "Fixed an issue with time zone handling."
- Forced: "Squashed a nasty bug! 🐛🔨"
- Rewrite: "Fixed dates shifting by a day for users east of UTC. Time zones: undefeated, but this round is ours."
- Why: the user-visible effect is literal and complete; the joke is one short clause at the end.

## Pull Request Description

- Flat: "Refactor the auth module."
- Rewrite: "Splits the 900-line `auth.ts` into four files. No behavior changes; the tests agree, and they are the only ones who read the old file end to end."
- Why: specific numbers, and the joke doubles as the verification claim.

## Roadmap

- Flat: "Future plans are subject to change."
- Rewrite: "In rough order of interest, which is not an order of delivery. No dates, because dates would be fiction."
- Why: honest about the limit, and it sets expectations.

## Places That Stay Plain

- Error documentation: "`ERR_TOKEN_EXPIRED`: the token is past its expiry. Request a new one with `refresh()`." A joke here costs a reader in trouble time.
- Security note: "Never commit `.env`; it holds production credentials." Nothing added.
- Breaking change: "Removed `legacy: true`. Migrate with the steps below before upgrading." The pull request description around it may play; the notice does not.

## Another Language

- Portuguese, flat: "A função trata fusos horários."
- Rewrite: "Esta função trata fusos horários, e é por isso que ela tem quarenta linhas em vez de uma."
- Why: the dark register rebuilt in Portuguese rhythm, not translated word by word.
- Portuguese, honest: "Funciona, e o porquê está na próxima seção, porque 'funciona' sem porquê é como toda gambiarra começa."
- Why: uses a joke the Brazilian developer culture already shares.
