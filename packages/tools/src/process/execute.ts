import { spawn } from "node:child_process";

const WINDOWS_QUOTE_ESCAPE = /(\\*)"/g;
const WINDOWS_TRAILING_BACKSLASHES = /(\\+)$/g;
const WINDOWS_COMMAND_QUOTING_REQUIRED = /[\s"&()<>^|%]/;
const WINDOWS_INVOCATION_VARIABLE = "CODENHUB_INVOCATION";
const FORCE_KILL_GRACE_MS = 5000;

/** A resolved child process invocation. */
export interface CommandSpec {
  /**
   * Executable name resolved through `PATH`, such as `pnpm` or `oxlint`.
   *
   * When {@link CommandSpec.shell} is set, this holds the shell command line;
   * {@link CommandSpec.args} are appended without reparsing their values.
   */
  command: string;
  /** Arguments passed to the executable or appended to the shell command line. */
  args: readonly string[];
  /** Absolute working directory for the child process. */
  cwd: string;
  /**
   * Whether {@link CommandSpec.command} is a shell command line rather than an
   * executable.
   *
   * Package scripts are shell lines: they chain with `&&`, quote their own
   * arguments, and are written against a shell rather than against `spawn`.
   * Running one without a shell would need the tooling to reimplement that
   * parsing, so the platform interpreter is handed the line as written.
   */
  shell?: boolean;
  /** Environment for the child process. Defaults to this process's environment. */
  env?: Readonly<Record<string, string | undefined>>;
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

/**
 * Wraps an argument in double quotes the way the Windows C runtime unwraps them.
 *
 * Backslashes are literal unless they precede a quote or close the argument,
 * which is the escaping the runtime applies when it parses a command line.
 * @param argument Argument to quote.
 * @returns Argument wrapped in quotes, with its backslashes and quotes escaped.
 */
export function quoteForWindows(argument: string): string {
  const escaped = argument.replaceAll(WINDOWS_QUOTE_ESCAPE, '$1$1\\"').replaceAll(WINDOWS_TRAILING_BACKSLASHES, "$1$1");
  return `"${escaped}"`;
}

/**
 * Places command parts in the child environment so `cmd.exe` expands each part
 * once without interpreting percent sequences introduced by its value.
 * @param parts Command and arguments to transport.
 * @param baseEnvironment Environment inherited by the invocation.
 * @returns Environment and references safe to place in a `/c` command string.
 */
function transportWindowsCommandParts(
  parts: readonly string[],
  baseEnvironment: Readonly<Record<string, string | undefined>> | undefined,
): { env: NodeJS.ProcessEnv; references: string[] } {
  const env = { ...(baseEnvironment ?? process.env) } as NodeJS.ProcessEnv;
  const usedNames = new Set(Object.keys(env).map((name) => name.toUpperCase()));
  const references = parts.map((part, index) => {
    let name = `${WINDOWS_INVOCATION_VARIABLE}_${index}`;
    while (usedNames.has(name)) {
      name = `_${name}`;
    }
    usedNames.add(name);
    env[name] = quoteForWindows(part);
    return `%${name}%`;
  });
  return { env, references };
}

function quoteWindowsCommand(command: string): string {
  return WINDOWS_COMMAND_QUOTING_REQUIRED.test(command) ? quoteForWindows(command) : command;
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
  env?: NodeJS.ProcessEnv;
  useWindowsVerbatimArguments: boolean;
} {
  if (spec.shell === true) {
    // `/s` makes the interpreter strip only the outermost quotes and take the
    // rest verbatim, which is what lets a script body keep its own quoting.
    if (process.platform === "win32") {
      const transported = transportWindowsCommandParts(spec.args, spec.env);
      const commandLine = [spec.command, ...transported.references].join(" ");
      return {
        args: ["/d", "/s", "/c", `"${commandLine}"`],
        env: transported.env,
        file: process.env.ComSpec ?? "cmd.exe",
        useWindowsVerbatimArguments: true,
      };
    }
    return {
      args: ["-c", `${spec.command} "$@"`, "--", ...spec.args],
      env: spec.env as NodeJS.ProcessEnv | undefined,
      file: "/bin/sh",
      useWindowsVerbatimArguments: false,
    };
  }
  if (process.platform !== "win32") {
    return {
      args: [...spec.args],
      env: spec.env as NodeJS.ProcessEnv | undefined,
      file: spec.command,
      useWindowsVerbatimArguments: false,
    };
  }

  // The interpreter strips the outermost quotes, so the whole command line is
  // wrapped to survive an executable path that contains spaces.
  const transported = transportWindowsCommandParts(spec.args, spec.env);
  const commandLine = [quoteWindowsCommand(spec.command), ...transported.references].join(" ");
  return {
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    env: transported.env,
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
  if (spec.shell === true) {
    return [
      spec.command,
      ...spec.args.map((argument) => (/[\s"]/u.test(argument) ? quoteForWindows(argument) : argument)),
    ].join(" ");
  }
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
      env: invocation.env,
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
