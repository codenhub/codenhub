import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CommandContext } from "../commands/definition.ts";

const OUTPUT_LIMIT = 12_000;

/**
 * Prepares captured diagnostics for display, retaining complete oversized output in a log.
 * @param context Invocation owning the output and repository log directory.
 * @param output Complete child output, including trailing whitespace.
 * @returns Complete short output or a bounded excerpt with its full log location.
 */
export async function prepareCapturedOutput(context: CommandContext, output: string): Promise<string> {
  const text = output.trimEnd();
  if (text.length <= OUTPUT_LIMIT || context.options.isVerbose || context.options.wantsJson) {
    return text;
  }

  try {
    JSON.parse(text);
    return text;
  } catch {
    // A tool's own JSON mode needs no hub flag; ordinary diagnostics continue below.
  }

  let logPath: string;
  try {
    const directory = join(context.workspace.root, "logs", "hub");
    await mkdir(directory, { recursive: true });
    logPath = join(await mkdtemp(join(directory, "output-")), "output.log");
    await writeFile(logPath, output, "utf8");
  } catch (cause) {
    context.reporter.warn(`Could not save complete output: ${String(cause)}. Showing it in full.`);
    return text;
  }

  const prefix = "\n[... ";
  const suffix = ` characters omitted; full log: ${logPath}]\n`;
  // Reserving the total length's digit count also fits the omitted count.
  const retained = OUTPUT_LIMIT - prefix.length - suffix.length - String(text.length).length;
  const headLength = Math.ceil(retained / 2);
  const tailLength = Math.floor(retained / 2);
  const head = text.slice(0, headLength).replace(/[\uD800-\uDBFF]$/, "");
  const tail = text.slice(-tailLength).replace(/^[\uDC00-\uDFFF]/, "");
  const notice = `${prefix}${text.length - head.length - tail.length}${suffix}`;
  return `${head}${notice}${tail}`;
}
