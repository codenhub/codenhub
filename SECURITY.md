# Security

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/codenhub/codenhub/security/advisories/new), not in a public issue. Name the package and version, describe the impact, and include the smallest reproduction you have.

A report is acknowledged on GitHub, and the advisory stays private until a fixed version is on npm.

## Supported versions

Fixes ship in a new version of the affected package. Only the latest published version of each package receives them; upgrade to it to pick up a fix.

Every version after a package's first is published from this repository's release workflow through npm trusted publishing, so its provenance on npm names the commit it was built from. A first version is published from a maintainer's machine and carries none; `docs/specs/packages-lifecycle.md` explains why.
