import { availableParallelism } from "node:os";

const DEFAULT_BASE_REF = "main";
const DEFAULT_TIMEOUT_SECONDS = 600;
/**
 * Packages processed at the same time when `--parallel` is not given.
 *
 * Capped well below the core count because a package run is not one process: a
 * test runner sizes its own worker pool from the same cores, so a cap of one per
 * core multiplies rather than saturates.
 */
const DEFAULT_CONCURRENCY_CAP = 6;
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
  /**
   * Whether prerequisite builds also cover workspace dependencies.
   *
   * On by default: a package that imports another package type-checks against
   * its built declarations, so skipping them passes on a tree that happens to
   * hold stale output and fails on a fresh clone.
   */
  shouldBuildDependencies: boolean;
  /** Verification steps left out of the run. */
  skippedSteps: readonly string[];
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
  /**
   * Whether every child process streams its output.
   *
   * Off by default: a passing run says nothing beyond its summary, so the output
   * that survives is the output that needs reading.
   */
  isVerbose: boolean;
  /** Whether usage information is requested. */
  wantsHelp: boolean;
  /** Whether the tooling version is requested. */
  wantsVersion: boolean;
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

/**
 * Packages processed at the same time when nothing was requested.
 * @returns Default concurrency for this machine.
 */
export function defaultConcurrency(): number {
  return Math.max(1, Math.min(availableParallelism(), DEFAULT_CONCURRENCY_CAP));
}

function createDefaultOptions(): CliOptions {
  return {
    baseRef: DEFAULT_BASE_REF,
    concurrency: defaultConcurrency(),
    includePack: false,
    isDryRun: false,
    isVerbose: false,
    shouldBail: false,
    shouldBuild: true,
    shouldBuildDependencies: true,
    shouldFix: false,
    skippedSteps: [],
    timeoutMs: DEFAULT_TIMEOUT_SECONDS * 1000,
    useChangedFilter: false,
    wantsHelp: false,
    wantsJson: false,
    wantsVersion: false,
  };
}

/**
 * Reads a positive number and scales it to the unit the option is stored in.
 *
 * The scaled result is what gets validated, not the number as it was typed: a
 * value large enough to overflow the conversion would otherwise be stored as
 * `Infinity`, and a timer set to that fires immediately rather than never.
 * @param name Flag name, used in the error message.
 * @param value Value as typed, or `undefined` for a bare flag.
 * @param fallback Value used when the flag carried none, in the typed unit.
 * @param scale Factor applied to reach the stored unit.
 * @returns The scaled value.
 * @throws When the value is not a positive, finite number once scaled.
 */
function readPositiveNumber(name: string, value: string | undefined, fallback: number, scale = 1): number {
  const parsed = value === undefined || value === "" ? fallback * scale : Number(value) * scale;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for --${name}: expected a positive number, received "${value ?? ""}".`);
  }
  return parsed;
}

function readPositiveInteger(name: string, value: string | undefined, fallback: number): number {
  const parsed = readPositiveNumber(name, value, fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid value for --${name}: expected a whole number, received "${value ?? ""}".`);
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
      options.concurrency = readPositiveInteger(name, value, availableParallelism());
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
    case "no-deps": {
      options.shouldBuildDependencies = false;
      return true;
    }
    case "skip": {
      const steps = (value ?? "")
        .split(",")
        .map((step) => step.trim())
        .filter((step) => step !== "");
      if (steps.length === 0) {
        throw new Error(`Invalid value for --skip: expected one or more step names, received "${value ?? ""}".`);
      }
      options.skippedSteps = [...options.skippedSteps, ...steps];
      return true;
    }
    case "timeout": {
      // An unbounded run is asked for with `--no-timeout`; this only ever reads a
      // finite number of seconds.
      options.timeoutMs = readPositiveNumber(name, value, DEFAULT_TIMEOUT_SECONDS, 1000);
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
    case "verbose": {
      options.isVerbose = true;
      return true;
    }
    case "help": {
      options.wantsHelp = true;
      return true;
    }
    case "version": {
      options.wantsVersion = true;
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
    if (argument === "-v" || argument === "-V") {
      options.wantsVersion = true;
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
