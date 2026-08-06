const DEFAULT_BASE_REF = "main";
const DEFAULT_TIMEOUT_SECONDS = 600;
const OPTION_TERMINATOR = "--";
const FLAG_PATTERN = /^--(?<name>[^=]+)(?:=(?<value>.*))?$/;

/** Global options understood by every command. */
export interface CliOptions {
  /** Whether the selection is narrowed to packages with changes. */
  useChangedFilter: boolean;
  /** Git ref used for change detection. */
  baseRef: string;
  /** Maximum packages processed at the same time. */
  concurrency: number;
  /** Whether the run stops at the first failing package. */
  shouldBail: boolean;
  /** Whether prerequisite build steps run before a script. */
  shouldBuild: boolean;
  /** Whether prerequisite builds also cover workspace dependencies. */
  shouldBuildDependencies: boolean;
  /** Milliseconds before a package run is killed, or `undefined` to wait indefinitely. */
  timeoutMs?: number;
  /** Whether commands print what they would run instead of running it. */
  isDryRun: boolean;
  /** Whether the command applies fixes rather than only reporting. */
  shouldFix: boolean;
  /** Whether checks may run `npm pack --dry-run` to inspect publishable contents. */
  includePack: boolean;
  /** Whether machine-readable output is requested. */
  wantsJson: boolean;
  /** Whether usage information is requested. */
  wantsHelp: boolean;
}

/** A command invocation split into its command, selectors, and tool arguments. */
export interface ParsedArguments {
  /** Command or package script name. */
  commandName: string;
  /** Package selectors such as names, paths, and globs. */
  tokens: readonly string[];
  /** Arguments forwarded to the underlying tool. */
  passthrough: readonly string[];
  /** Global options. */
  options: CliOptions;
}

function createDefaultOptions(): CliOptions {
  return {
    baseRef: DEFAULT_BASE_REF,
    concurrency: 1,
    includePack: false,
    isDryRun: false,
    shouldBail: false,
    shouldBuild: true,
    shouldBuildDependencies: false,
    shouldFix: false,
    timeoutMs: DEFAULT_TIMEOUT_SECONDS * 1000,
    useChangedFilter: false,
    wantsHelp: false,
    wantsJson: false,
  };
}

function readPositiveNumber(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for --${name}: expected a positive number, received "${value}".`);
  }
  return parsed;
}

function applyFlag(options: CliOptions, name: string, value: string | undefined): boolean {
  switch (name) {
    case "changed": {
      options.useChangedFilter = true;
      options.baseRef = value === undefined || value === "" ? options.baseRef : value;
      return true;
    }
    case "base": {
      options.baseRef = value ?? options.baseRef;
      return true;
    }
    case "parallel": {
      options.concurrency = readPositiveNumber(name, value, Number.POSITIVE_INFINITY);
      return true;
    }
    case "bail": {
      options.shouldBail = true;
      return true;
    }
    case "no-build": {
      options.shouldBuild = false;
      return true;
    }
    case "deps": {
      options.shouldBuildDependencies = true;
      return true;
    }
    case "timeout": {
      const seconds = readPositiveNumber(name, value, DEFAULT_TIMEOUT_SECONDS);
      options.timeoutMs = seconds === Number.POSITIVE_INFINITY ? undefined : seconds * 1000;
      return true;
    }
    case "no-timeout": {
      options.timeoutMs = undefined;
      return true;
    }
    case "dry-run": {
      options.isDryRun = true;
      return true;
    }
    case "fix": {
      options.shouldFix = true;
      return true;
    }
    case "pack": {
      options.includePack = true;
      return true;
    }
    case "json": {
      options.wantsJson = true;
      return true;
    }
    case "help": {
      options.wantsHelp = true;
      return true;
    }
    default: {
      return false;
    }
  }
}

/**
 * Splits raw CLI arguments into a command, package selectors, and tool arguments.
 *
 * Unrecognized flags are forwarded to the underlying tool so package runners keep
 * their own option surfaces. Everything after a bare `--` is forwarded verbatim.
 * @param argv Arguments after the executable and script paths.
 * @returns Command name, selectors, forwarded arguments, and global options.
 * @throws When a known flag receives an unusable value.
 */
export function parseArguments(argv: readonly string[]): ParsedArguments {
  const options = createDefaultOptions();
  const tokens: string[] = [];
  const passthrough: string[] = [];
  let commandName = "";
  let isForwarding = false;

  for (const argument of argv) {
    if (isForwarding) {
      passthrough.push(argument);
      continue;
    }
    if (argument === OPTION_TERMINATOR) {
      isForwarding = true;
      continue;
    }
    if (argument === "-h") {
      options.wantsHelp = true;
      continue;
    }
    const flag = FLAG_PATTERN.exec(argument);
    if (flag?.groups !== undefined) {
      if (!applyFlag(options, flag.groups.name as string, flag.groups.value)) {
        passthrough.push(argument);
      }
      continue;
    }
    if (argument.startsWith("-")) {
      passthrough.push(argument);
      continue;
    }
    if (commandName === "") {
      commandName = argument;
      continue;
    }
    tokens.push(argument);
  }

  return { commandName, options, passthrough, tokens };
}
