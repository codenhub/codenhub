import type { WorkspacePackage } from "../workspace/discover.ts";

/** Whether a finding blocks a run or only reports. */
export type FindingSeverity = "error" | "warning";

/** One compliance problem found in a package. */
export interface Finding {
  /**
   * Stable `<rule>/<detail>` identifier.
   *
   * It is what the exception register bypasses, so it must stay narrow enough to
   * waive one requirement without waiving a whole rule.
   */
  code: string;
  /** Whether the finding fails the run. `warning` covers SHOULD-level rules. */
  severity: FindingSeverity;
  /** Human-readable explanation of what is wrong. */
  message: string;
  /** Package-relative path the finding belongs to, when it has one. */
  location?: string;
}

/** How a rule should inspect a package. */
export interface CheckRuleContext {
  /** Package being inspected. */
  package: WorkspacePackage;
  /** Whether slow `npm pack --dry-run` checks are allowed to run. */
  includePack: boolean;
  /** Milliseconds before a child process a rule spawns is killed, or `undefined` to wait indefinitely. */
  timeoutMs?: number;
}

/** A compliance rule derived from a repository specification. */
export interface CheckRule {
  /** Stable rule identifier and prefix of every code it emits. */
  name: string;
  /** One-line description shown in help output. */
  summary: string;
  /**
   * Reports whether the rule has anything to say about a package.
   *
   * Rules opt out here rather than returning no findings so `hub check` can tell
   * "not applicable" apart from "compliant".
   */
  appliesTo(workspacePackage: WorkspacePackage): boolean;
  /** Inspects one package. */
  run(context: CheckRuleContext): Promise<Finding[]> | Finding[];
}
