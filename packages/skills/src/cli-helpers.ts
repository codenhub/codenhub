import * as os from "os";
import * as path from "path";

import { ANSI } from "./prompts.js";

const HOME = os.homedir();

export const HARNESS_MAPPING: Record<string, string> = {
  "Antigravity Global": path.join(HOME, ".gemini/config/skills"),
  "Antigravity Workspace": path.resolve("./.agents/skills"),
  "OpenCode Global": path.join(HOME, ".config/opencode/skills"),
  "OpenCode Workspace": path.resolve("./.opencode/skills"),
  "Claude Global": path.join(HOME, ".claude/skills"),
  "Claude Workspace": path.resolve("./.claude/skills"),
  "Codex Global": path.join(HOME, ".codex/skills"),
  "Codex Workspace": path.resolve("./.codex/skills"),
};

export const CODEX_IDENTIFIER = "Codex";
export const EXCLUDE_FOLDER_AGENTS = "agents";
export const EXIT_CODE_CANCELLED = 130;

/**
 * Thrown when the user makes a selection that has no valid items,
 * indicating the wizard should exit cleanly instead of continuing.
 */
export class PromptExitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptExitError";
  }
}

export interface State {
  scope: string;
  shouldInstallAll: boolean;
  selectedSkills: string[];
  selectedHarnesses: string[];
  shouldCleanupFirst: boolean;
}

export interface Step {
  id: string;
  title: string;
  /** Returns the human-readable summary for the completed-steps header. */
  summarize: () => string;
  run: (canGoBack: boolean) => Promise<boolean | symbol>;
}

export function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

export function drawHeader(): void {
  console.log(`${ANSI.BOLD}${ANSI.CYAN}=========================================${ANSI.RESET}`);
  console.log(`${ANSI.BOLD}${ANSI.CYAN}    Codenhub AI Agent Skills Installer${ANSI.RESET}`);
  console.log(`${ANSI.BOLD}${ANSI.CYAN}=========================================${ANSI.RESET}\n`);
}

export function drawSummary(currentIdx: number, activeSteps: Step[]): void {
  for (let i = 0; i < currentIdx; i++) {
    const step = activeSteps[i];
    console.log(`${ANSI.GREEN}✔${ANSI.RESET} ${ANSI.BOLD}${step.title}:${ANSI.RESET} ${step.summarize()}`);
  }
  if (currentIdx > 0) {
    console.log(""); // Empty line after summaries
  }

  if (currentIdx < activeSteps.length) {
    const step = activeSteps[currentIdx];
    console.log(`${ANSI.BOLD}${ANSI.BLUE}[Step ${currentIdx + 1}/${activeSteps.length}] ${step.title}${ANSI.RESET}\n`);
  }
}
