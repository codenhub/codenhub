---
title: Security and Failures
---

# Security And Failure Behavior

The package reads and writes local filesystem trees synchronously. Callers and
CLI users must choose trusted sources and destinations and grant only the
required filesystem permissions.

## Path Constraints

`copyRecursiveSync` canonicalizes the source and as much of the destination as
currently exists. It rejects a destination that resolves to the source itself
or within the source, preventing recursive self-copying through ordinary paths
or existing destination symlinks.

During directory copies, a source symlink must resolve within the canonical
source tree. A symlink that resolves outside that tree throws a directory
traversal error. Accepted symlinks are followed and their resolved file or
directory contents are copied. Revisited canonical directories are skipped to
avoid symlink cycles.

These checks constrain reads performed through source symlinks. They do not turn
the API into a sandbox or validate that caller-provided destinations are
appropriate. Avoid copying attacker-controlled trees into sensitive locations.
Filesystem state can also change between synchronous checks and operations.

## Copy Failure Behavior

The programmatic API throws when:

- The source path does not exist.
- The destination resolves to the source or one of its descendants.
- A source symlink resolves outside the source tree.
- Reading, resolving, creating, deleting, or writing a filesystem entry fails.

Copies are not transactional. Files written before an error remain at the
destination, and overwritten files are not restored. Existing destination-only
files remain unless the CLI cleanup option removes the whole destination first.

## CLI Failure Behavior

The CLI exits with code `1` for invalid arguments, unknown skill IDs, harnesses
that do not match the selected scope, no detected harness, missing bundled
skills, unhandled exceptions, or any skill copy failure. Copy failures are
reported individually, and installation continues for the remaining selected
skills and harnesses before the final nonzero exit.

Pressing Ctrl+C in the interactive wizard exits with code `130`. Leaving the
wizard with no selected skills or harnesses prints a message and exits with code
`0` without installing.

Cleanup failures are reported but do not by themselves set a nonzero exit code.
The installer continues to copy into that destination. Consumers automating
`--cleanup` must inspect output as well as the final exit code.

## Destructive Cleanup

The CLI's `--cleanup` option uses recursive forced removal on every selected
harness skills root. It removes unmanaged content as well as previously
installed package content. Destination paths are fixed by the selected harness
and scope, but workspace destinations are resolved from the current working
directory. Confirm both before running cleanup.

See the [CLI installer](cli.md#destructive-cleanup) for destinations and safe-use
guidance.
