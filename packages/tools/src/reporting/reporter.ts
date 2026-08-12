const STYLES = {
  bold: "[1m",
  cyan: "[36m",
  dim: "[2m",
  green: "[32m",
  red: "[31m",
  reset: "[0m",
  yellow: "[33m",
} as const;

/** Outcome shown for one row of a run summary. */
export type SummaryStatus = "passed" | "failed" | "warned" | "skipped" | "timed-out";

/** One line of a run summary. */
export interface SummaryRow {
  /** Row label, normally a package name. */
  label: string;
  /** Outcome for the row. */
  status: SummaryStatus;
  /** Optional trailing detail such as a duration or reason. */
  detail?: string;
}

/** Terminal output surface shared by every command. */
export interface Reporter {
  /** Writes a neutral message. */
  info(message: string): void;
  /** Writes a de-emphasized message. */
  detail(message: string): void;
  /** Writes a section heading for a unit of work. */
  step(message: string): void;
  /** Writes a warning. */
  warn(message: string): void;
  /** Writes an error. */
  error(message: string): void;
  /** Writes a blank separator line. */
  blank(): void;
  /** Writes a table of run outcomes. */
  summarize(rows: readonly SummaryRow[]): void;
  /** Writes a one-line count of run outcomes. */
  tally(rows: readonly SummaryRow[], durationMs?: number): void;
}

/** Behavior overrides for a reporter, used by tests and non-terminal output. */
export interface ReporterOptions {
  /** Sink for normal output. Defaults to stdout. */
  write?: (line: string) => void;
  /** Sink for warnings and errors. Defaults to stderr. */
  writeError?: (line: string) => void;
  /** Whether ANSI styling is applied. Defaults to terminal and `NO_COLOR` detection. */
  useColor?: boolean;
}

const TALLY_ORDER: readonly SummaryStatus[] = ["failed", "timed-out", "warned", "passed", "skipped"];

const TALLY_WORDS: Record<SummaryStatus, string> = {
  failed: "failed",
  passed: "passed",
  skipped: "skipped",
  "timed-out": "timed out",
  warned: "warned",
};

const STATUS_LABELS: Record<SummaryStatus, { text: string; color: keyof typeof STYLES }> = {
  failed: { color: "red", text: "FAIL" },
  passed: { color: "green", text: "PASS" },
  skipped: { color: "dim", text: "SKIP" },
  "timed-out": { color: "yellow", text: "TIME" },
  warned: { color: "yellow", text: "WARN" },
};

function detectColorSupport(): boolean {
  return process.env.NO_COLOR === undefined && process.stdout.isTTY === true;
}

/**
 * Formats a duration for run summaries.
 * @param durationMs Duration in milliseconds.
 * @returns Compact duration such as `820ms` or `12.4s`.
 */
export function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${Math.round(durationMs)}ms` : `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * Creates the terminal reporter used by every command.
 * @param options Output sinks and styling overrides.
 * @returns Reporter bound to the given sinks.
 */
export function createReporter(options: ReporterOptions = {}): Reporter {
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeError = options.writeError ?? ((line: string) => process.stderr.write(`${line}\n`));
  const useColor = options.useColor ?? detectColorSupport();

  const paint = (style: keyof typeof STYLES, text: string): string =>
    useColor ? `${STYLES[style]}${text}${STYLES.reset}` : text;

  return {
    blank: () => write(""),
    detail: (message) => write(paint("dim", message)),
    error: (message) => writeError(`${paint("red", "error")} ${message}`),
    info: (message) => write(message),
    step: (message) => write(`${paint("cyan", "▸")} ${paint("bold", message)}`),
    summarize: (rows) => {
      if (rows.length === 0) {
        return;
      }
      const width = Math.max(...rows.map(({ label }) => label.length));
      for (const row of rows) {
        const status = STATUS_LABELS[row.status];
        const detail = row.detail === undefined ? "" : ` ${paint("dim", row.detail)}`;
        write(`  ${paint(status.color, status.text)}  ${row.label.padEnd(width)}${detail}`);
      }
    },
    tally: (rows, durationMs) => {
      if (rows.length === 0) {
        return;
      }
      const counted = TALLY_ORDER.filter((status) => rows.some((row) => row.status === status)).map((status) => {
        const count = rows.filter((row) => row.status === status).length;
        return paint(STATUS_LABELS[status].color, `${count} ${TALLY_WORDS[status]}`);
      });
      const duration = durationMs === undefined ? "" : paint("dim", ` in ${formatDuration(durationMs)}`);
      write(`  ${counted.join(paint("dim", ", "))}${duration}`);
    },
    warn: (message) => writeError(`${paint("yellow", "warn")} ${message}`),
  };
}
