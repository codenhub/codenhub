import { mapConcurrent } from "../process/concurrency.ts";
import type { SummaryRow } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { EXIT_FAILURE, EXIT_SUCCESS, type CommandContext, type CommandDefinition } from "./definition.ts";

interface Finding {
  code: string;
  severity: "error" | "warning";
  message: string;
  location?: string;
}

interface PackageReport {
  workspacePackage: WorkspacePackage;
  findings: Finding[];
  waivedCount: number;
  appliedRules: number;
}

async function inspectPackages(context: CommandContext): Promise<PackageReport[]> {
  // The rules pull in a Markdown parser, which every other command can do without.
  const { loadCheckExceptions } = await import("../checks/exceptions.ts");
  const { createCheckRules } = await import("../checks/registry.ts");
  const [exceptions, rules] = [await loadCheckExceptions(context.workspace.root), createCheckRules(context.workspace)];
  const packages = context.selection.targets.map(({ package: workspacePackage }) => workspacePackage);

  return mapConcurrent(packages, context.options.concurrency, async (workspacePackage) => {
    const applicable = rules.filter((rule) => rule.appliesTo(workspacePackage));
    const results = await Promise.all(
      applicable.map(async (rule) => rule.run({ includePack: context.options.includePack, package: workspacePackage })),
    );
    const waived = exceptions.get(workspacePackage.name) ?? new Set<string>();
    const findings = results.flat().filter(({ code }) => !waived.has(code));
    return {
      appliedRules: applicable.length,
      findings,
      waivedCount: results.flat().length - findings.length,
      workspacePackage,
    };
  });
}

function describeStatus(report: PackageReport): SummaryRow {
  const { appliedRules, findings, waivedCount, workspacePackage } = report;
  const waived = waivedCount === 0 ? "" : `, ${waivedCount} waived`;
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

function report(context: CommandContext, reports: readonly PackageReport[]): void {
  for (const packageReport of reports) {
    if (packageReport.findings.length === 0) {
      continue;
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
  context.reporter.blank();
  context.reporter.summarize(reports.map(describeStatus));
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
      const reports = await inspectPackages(context);
      if (context.options.wantsJson) {
        context.reporter.info(
          JSON.stringify(
            reports.map(({ findings, waivedCount, workspacePackage }) => ({
              findings,
              package: workspacePackage.name,
              waived: waivedCount,
            })),
            undefined,
            2,
          ),
        );
      } else {
        report(context, reports);
      }
      const hasError = reports.some(({ findings }) => findings.some(({ severity }) => severity === "error"));
      return hasError ? EXIT_FAILURE : EXIT_SUCCESS;
    },
    summary: "Check packages against the lifecycle and documentation specs.",
    usage: "hub check [targets...] [--pack] [--json]",
  };
}
