import { spawn } from "node:child_process";

const WINDOWS_QUOTE_ESCAPE = /(\\*)"/g;
const WINDOWS_TRAILING_BACKSLASHES = /(\\+)$/g;
const WINDOWS_QUOTING_REQUIRED = /[\s"&()<>^|]/;
const FORCE_KILL_GRACE_MS = 5000;

/** A resolved child process invocation. */
export interface CommandSpec {
  /** Executable name resolved through `PATH`, such as `pnpm` or `oxlint`. */
  command: string;
  /** Arguments passed to the executable. */
  args: readonly string[];
  /** Absolute working directory for the child process. */
  cwd: string;
}

/** How a child process should be started and observed. */
export interface ExecuteOptions {
  /**
   * `inherit` streams child output straight to the terminal, which is required
   * for interactive commands. `pipe` captures output so it can be replayed after
   * concurrent runs finish.
   */
  stdio: "inherit" | "pipe";
  /** Milliseconds before the child process tree is killed, or `undefined` to wait indefinitely. */
  timeoutMs?: number;
}

/** Observed result of a finished child process. */
export interface CommandOutcome {
  /** Whether the process exited successfully. */
  isSuccess: boolean;
  /** Process exit code, or `undefined` when the process was terminated by a signal. */
  exitCode?: number;
  /** Whether the process was killed because it exceeded its timeout. */
  didTimeOut: boolean;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Combined stdout and stderr, present only when `stdio` was `pipe`. */
  output?: string;
  /**
   * Standard output alone, present only when `stdio` was `pipe`.
   *
   * Commands that emit machine-readable output on stdout and progress on stderr
   * cannot use {@link CommandOutcome.output}, which interleaves both.
   */
  stdout?: string;
}

function quoteWindowsArgument(argument: string): string {
  if (argument !== "" && !WINDOWS_QUOTING_REQUIRED.test(argument)) {
    return argument;
  }
  // Backslashes are literal unless they precede a quote or close the argument,
  // which is the escaping the C runtime applies when it parses a command line.
  const escaped = argument.replaceAll(WINDOWS_QUOTE_ESCAPE, '$1$1\\"').replaceAll(WINDOWS_TRAILING_BACKSLASHES, "$1$1");
  return `"${escaped}"`;
}

/**
 * Builds the platform-specific invocation for a command.
 *
 * Node refuses to spawn Windows `.cmd` shims directly, so commands installed by
 * package managers must be routed through the command interpreter.
 * @param spec Command to invoke.
 * @returns Executable, arguments, and whether Windows verbatim argument handling applies.
 */
export function resolveInvocation(spec: CommandSpec): {
  file: string;
  args: string[];
  useWindowsVerbatimArguments: boolean;
} {
  if (process.platform !== "win32") {
    return { args: [...spec.args], file: spec.command, useWindowsVerbatimArguments: false };
  }

  // The interpreter strips the outermost quotes, so the whole command line is
  // wrapped to survive an executable path that contains spaces.
  const commandLine = [spec.command, ...spec.args].map(quoteWindowsArgument).join(" ");
  return {
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    file: process.env.ComSpec ?? "cmd.exe",
    useWindowsVerbatimArguments: true,
  };
}

/**
 * Renders a command as a copyable shell line for diagnostics and dry runs.
 * @param spec Command to render.
 * @returns Human-readable command line.
 */
export function formatCommand(spec: CommandSpec): string {
  return [spec.command, ...spec.args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ");
}

function killProcessTree(processId: number, kill: (signal: NodeJS.Signals) => void): void {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(processId), "/t", "/f"], { stdio: "ignore" }).unref();
    return;
  }
  kill("SIGTERM");
  setTimeout(() => kill("SIGKILL"), FORCE_KILL_GRACE_MS).unref();
}

/**
 * Runs a command to completion.
 *
 * The process tree is killed when `timeoutMs` elapses, which prevents a hanging
 * package from blocking a whole workspace run. Failure is reported through the
 * returned outcome rather than by throwing; only a failure to spawn rejects.
 * @param spec Command to run.
 * @param options Streaming and timeout behavior.
 * @returns Outcome describing exit status, duration, and captured output.
 */
export async function execute(spec: CommandSpec, options: ExecuteOptions): Promise<CommandOutcome> {
  const startedAt = performance.now();
  const invocation = resolveInvocation(spec);

  return new Promise<CommandOutcome>((resolve, reject) => {
    const child = spawn(invocation.file, invocation.args, {
      cwd: spec.cwd,
      stdio: options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
      windowsVerbatimArguments: invocation.useWindowsVerbatimArguments,
    });

    const chunks: string[] = [];
    const stdoutChunks: string[] = [];
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      chunks.push(chunk);
      stdoutChunks.push(chunk);
    });
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => chunks.push(chunk));

    let didTimeOut = false;
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            didTimeOut = true;
            if (child.pid !== undefined) {
              killProcessTree(child.pid, (signal) => child.kill(signal));
            }
          }, options.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Failed to run \`${formatCommand(spec)}\` in ${spec.cwd}: ${error.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        didTimeOut,
        durationMs: performance.now() - startedAt,
        exitCode: code ?? undefined,
        isSuccess: code === 0 && !didTimeOut,
        output: options.stdio === "pipe" ? chunks.join("") : undefined,
        stdout: options.stdio === "pipe" ? stdoutChunks.join("") : undefined,
      });
    });
  });
}
