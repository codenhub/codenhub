# @codenhub/skills

`@codenhub/skills` brings together a collection of AI agent skills, a CLI that
installs them into supported harnesses, and Node.js utilities for working with
skill directories. Use the part that fits your task: install the bundled skills,
integrate skill discovery and copying into your own tooling, or inspect what the
package ships and how those assets are structured.

> **Experimental:** The CLI workflow, harness support, install destinations, and
> bundled skill content may change as agent skill conventions evolve. Review
> destination and cleanup behavior before automating installation.

## Try An Install

If you want to install the bundled skills, a reasonable first step is to run the
interactive installer from the workspace where you want to use them:

```sh
pnpm dlx @codenhub/skills@latest
```

The npm equivalent is `npx @codenhub/skills@latest`. The installer requires
Node.js 18.0.0 or newer. With no arguments in a TTY, it lets you choose the
scope, skills, harnesses, and whether to clean existing destinations. See the
[CLI installer](cli.md) before scripting an install or choosing destinations
explicitly.

The CLI is only one way into the package. Choose the path that matches what you
are trying to do:

- [Programmatic API](api.md) covers the synchronous parser, discovery, and
  recursive copy utilities exported from `@codenhub/skills` for custom Node.js
  workflows.
- [Skill format and catalog](skills.md) explains the supported `SKILL.md` shape
  and lists the bundled skills when you need to evaluate or author compatible
  assets.
- [CLI installer](cli.md) is the complete reference for interactive and
  automated installation, scopes, options, and harness-specific behavior.

The `skills/` tree is shipped product content rather than package
documentation. Its `SKILL.md` files and supporting assets are instructions
consumed by agent harnesses; the focused package docs explain how those assets
are discovered, copied, and installed without duplicating their contents.

## Before Changing Files

Installation and copying write directly to local filesystem trees and are not
transactional. In particular, `--cleanup` removes an entire selected harness
skills directory, including content not managed by this package. Read
[security and failure behavior](security-and-failures.md) for path and symlink
constraints, partial-write behavior, cleanup risks, and CLI exit semantics.

Bundled skills include adapted third-party material. The
[skill provenance](provenance.md) page records origins, licenses, and the path
from package-level notices to the per-skill `NOTICE` files copied with each
asset.
