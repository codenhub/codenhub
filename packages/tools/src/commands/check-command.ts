import type { CheckExceptions } from "../checks/exceptions.ts";
import type { Finding } from "../checks/rule.ts";
import { mapConcurrent } from "../process/concurrency.ts";
import type { SummaryRow } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

interface PackageReport {
  workspacePackage: WorkspacePackage;
  findings: Finding[];
  /** Waived codes that actually suppressed a finding. */
  waivedCodes: string[];
  /** Waived codes that suppressed nothing, meaning the register entry is dead. */
  unusedWaivers: string[];
  appliedRules: number;
}

interface CheckReport {
  packages: PackageReport[];
  /** Register entries naming a package that is not in the workspace. */
  unknownPackages: string[];
}

function inspectPackage(
  workspacePackage: WorkspacePackage,
  waived: ReadonlySet<string>,
  results: readonly Finding[][],
  appliedRules: number,
): PackageReport {
  const reported = results.flat();
  const findings = reported.filter(({ code }) => !waived.has(code));
  const suppressed = new Set(reported.filter(({ code }) => waived.has(code)).map(({ code }) => code));
  return {
    appliedRules,
    findings,
    unusedWaivers: [...waived].filter((code) => !suppressed.has(code)).sort(),
    waivedCodes: [...suppressed].sort(),
    workspacePackage,
  };
}

/**
 * Lists register entries that name a package outside the current selection scope.
 *
 * Only a whole-workspace run can tell a stale package name apart from one that
 * simply was not selected, so a narrowed run reports nothing.
 * @param context Command invocation.
 * @param exceptions Parsed exception register.
 * @returns Register package names with no workspace package, or an empty list.
 */
function findUnknownRegisterPackages(context: CommandContext, exceptions: CheckExceptions): string[] {
  if (context.selection.targets.length !== context.workspace.packages.length) {
    return [];
  }
  const names = new Set(context.workspace.packages.map(({ name }) => name));
  return [...exceptions.keys()].filter((name) => !names.has(name)).sort();
}

async function inspectPackages(context: CommandContext): Promise<CheckReport> {
  // The rules pull in a Markdown parser, which every other command can do without.
  const { loadCheckExceptions } = await import("../checks/exceptions.ts");
  const { createCheckRules } = await import("../checks/registry.ts");
  const [exceptions, rules] = [await loadCheckExceptions(context.workspace.root), createCheckRules(context.workspace)];
  const packages = context.selection.targets.map(({ package: workspacePackage }) => workspacePackage);

  const reports = await mapConcurrent(packages, context.options.concurrency, async (workspacePackage) => {
    const applicable = rules.filter((rule) => rule.appliesTo(workspacePackage));
    const results = await Promise.all(
      applicable.map(async (rule) =>
        rule.run({
          includePack: context.options.includePack,
          package: workspacePackage,
          timeoutMs: context.options.timeoutMs,
        }),
      ),
    );
    return inspectPackage(
      workspacePackage,
      exceptions.get(workspacePackage.name) ?? new Set(),
      results,
      applicable.length,
    );
  });

  return { packages: reports, unknownPackages: findUnknownRegisterPackages(context, exceptions) };
}

function describeStatus(report: PackageReport): SummaryRow {
  const { appliedRules, findings, waivedCodes, workspacePackage } = report;
  const waived = waivedCodes.length === 0 ? "" : `, ${waivedCodes.length} waived`;
  if (appliedRules === 0) {
    return { detail: "no rules apply", label: workspacePackage.name, status: "skipped" };
  }
  const errors = findings.filter(({ severity }) => severity === "error").length;
  if (findings.length === 0) {
    return { detail: `${appliedRules} rule(s)${waived}`, label: workspacePackage.name, status: "passed" };
  }
  return {
    detail: `${errors} error(s), ${findings.length - errors} warning(s)${waived}`,
    label: workspacePackage.name,
    status: errors > 0 ? "failed" : "warned",
  };
}

/**
 * Prints one package's findings.
 *
 * Findings go to stdout rather than to `reporter.warn` and `reporter.error`,
 * which carry operational diagnostics. A compliance report is what the command
 * produces, not a complaint about running it, and splitting the block across two
 * streams would let the terminal interleave it out of order.
 * @param context Command invocation.
 * @param packageReport Inspection results for one package.
 */
function reportFindings(context: CommandContext, packageReport: PackageReport): void {
  if (packageReport.findings.length === 0) {
    return;
  }
  context.reporter.blank();
  context.reporter.step(packageReport.workspacePackage.name);
  for (const finding of packageReport.findings) {
    const location =
      finding.location === undefined
        ? packageReport.workspacePackage.location
        : `${packageReport.workspacePackage.location}/${finding.location}`;
    context.reporter.info(`  ${finding.severity === "error" ? "error" : "warn "}  ${location}`);
    context.reporter.detail(`         ${finding.code}: ${finding.message}`);
  }
}

/**
 * Reports exception register entries that no longer waive anything.
 *
 * A waiver that suppresses nothing is indistinguishable from a typo, so it is
 * surfaced rather than left to look effective.
 * @param context Command invocation.
 * @param report Inspection results for the whole run.
 */
function reportDeadWaivers(context: CommandContext, report: CheckReport): void {
  const unused = report.packages.filter(({ unusedWaivers }) => unusedWaivers.length > 0);
  if (unused.length === 0 && report.unknownPackages.length === 0) {
    return;
  }
  context.reporter.blank();
  context.reporter.step("Exception register");
  for (const { unusedWaivers, workspacePackage } of unused) {
    context.reporter.info(`  warn   ${workspacePackage.name}`);
    context.reporter.detail(`         waives nothing: ${unusedWaivers.join(", ")}`);
  }
  for (const name of report.unknownPackages) {
    context.reporter.info(`  warn   ${name}`);
    context.reporter.detail(`         no workspace package has this name`);
  }
}

function reportRun(context: CommandContext, report: CheckReport): void {
  for (const packageReport of report.packages) {
    reportFindings(context, packageReport);
  }
  reportDeadWaivers(context, report);
  const rows = report.packages.map(describeStatus);
  context.reporter.blank();
  // The findings above are the report; a table repeating that everything else
  // complied is the part nobody reads.
  if (context.options.isVerbose) {
    context.reporter.summarize(rows);
  } else {
    context.reporter.summarize(rows.filter(({ status }) => status === "failed" || status === "warned"));
  }
  context.reporter.tally(rows);
}

/**
 * Creates the command that checks packages against the repository specs.
 *
 * Every selected package is inspected before anything is printed, so one
 * non-compliant package cannot hide the rest. Only errors fail the run;
 * SHOULD-level rules report as warnings, and the exception register waives
 * individual check codes.
 * @returns Command definition ready for registration.
 */
export function createCheckCommand(): CommandDefinition {
  return {
    name: "check",
    run: async (context) => {
      const checkReport = await inspectPackages(context);
      if (context.options.wantsJson) {
        context.reporter.info(
          JSON.stringify(
            checkReport.packages.map(({ findings, unusedWaivers, waivedCodes, workspacePackage }) => ({
              findings,
              package: workspacePackage.name,
              unusedWaivers,
              waived: waivedCodes.length,
            })),
            undefined,
            2,
          ),
        );
      } else {
        reportRun(context, checkReport);
      }
      const hasError = checkReport.packages.some(({ findings }) =>
        findings.some(({ severity }) => severity === "error"),
      );
      return hasError ? EXIT_FAILURE : EXIT_SUCCESS;
    },
    summary: "Check packages against the lifecycle and documentation specs.",
    usage: "hub check [targets...] [--pack] [--json]",
  };
}
