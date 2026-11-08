## What and why

<!-- What the change does for someone reading the log later, and why it is needed. -->

Fixes #

## Checks

- [ ] The delivery gate `CONTRIBUTING.md` names passes, `pnpm verify` by default, or the skipped steps are listed here
- [ ] Documentation affected by behavior, API, or convention changes is updated in this pull request

<!-- project:start -->

- [ ] Derived files are regenerated (`pnpm generate <target>`) if a package README or `docs/` changed

<!-- project:end -->

## Security

- [ ] No secret, token, or personal data can reach a log, an error, a snapshot, or a response other than the one that shows a new secret to its creator
- [ ] New untrusted input is validated where it enters, with a bounded size
- [ ] A new dependency, permission, or externally reachable surface is named in the description
