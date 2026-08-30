import * as os from "os";
import * as path from "path";

import { ANSI } from "./prompts.js";

const HOME = os.homedir();

export type HarnessScope = "global" | "workspace";

export interface HarnessDestination {
  /** Selection label used by the wizard and the `--harnesses` option. */
  label: string;
  scope: HarnessScope;
  /** Absolute destination directory skills are copied into. */
  dest: string;
  /**
   * Whether the destination also receives each skill's `agents` metadata
   * folder. Only Codex consumes it, and Codex reads the Agent Skills standard
   * locations, so only the Codex entries set this.
   */
  includeAgentsFolder?: boolean;
}

/**
 * Installs target the Agent Skills standard locations (`.agents/skills`) first
 * because most harnesses read them natively; the remaining entries cover
 * harnesses that only read their own directory.
 */
export const HARNESS_DESTINATIONS: HarnessDestination[] = [
  { label: "Agent Skills Workspace", scope: "workspace", dest: path.resolve("./.agents/skills") },
  { label: "Agent Skills Global", scope: "global", dest: path.join(HOME, ".agents/skills") },
  { label: "Antigravity Workspace", scope: "workspace", dest: path.resolve("./.agents/skills") },
  { label: "Antigravity Global", scope: "global", dest: path.join(HOME, ".gemini/config/skills") },
  { label: "Claude Workspace", scope: "workspace", dest: path.resolve("./.claude/skills") },
  { label: "Claude Global", scope: "global", dest: path.join(HOME, ".claude/skills") },
  { label: "Cline Workspace", scope: "workspace", dest: path.resolve("./.cline/skills") },
  { label: "Cline Global", scope: "global", dest: path.join(HOME, ".cline/skills") },
  {
    label: "Codex Workspace",
    scope: "workspace",
    dest: path.resolve("./.agents/skills"),
    includeAgentsFolder: true,
  },
  {
    label: "Codex Global",
    scope: "global",
    dest: path.join(HOME, ".agents/skills"),
    includeAgentsFolder: true,
  },
  { label: "Copilot Workspace", scope: "workspace", dest: path.resolve("./.github/skills") },
  { label: "Copilot Global", scope: "global", dest: path.join(HOME, ".copilot/skills") },
  { label: "Cursor Workspace", scope: "workspace", dest: path.resolve("./.cursor/skills") },
  { label: "Cursor Global", scope: "global", dest: path.join(HOME, ".cursor/skills") },
  { label: "Gemini CLI Workspace", scope: "workspace", dest: path.resolve("./.gemini/skills") },
  { label: "Gemini CLI Global", scope: "global", dest: path.join(HOME, ".gemini/skills") },
  { label: "Kiro Workspace", scope: "workspace", dest: path.resolve("./.kiro/skills") },
  { label: "Kiro Global", scope: "global", dest: path.join(HOME, ".kiro/skills") },
  { label: "OpenCode Workspace", scope: "workspace", dest: path.resolve("./.opencode/skills") },
  { label: "OpenCode Global", scope: "global", dest: path.join(HOME, ".config/opencode/skills") },
  { label: "Trae Workspace", scope: "workspace", dest: path.resolve("./.trae/skills") },
  { label: "Trae Global", scope: "global", dest: path.join(HOME, ".trae/skills") },
  { label: "Windsurf Workspace", scope: "workspace", dest: path.resolve("./.windsurf/skills") },
  {
    label: "Windsurf Global",
    scope: "global",
    dest: path.join(HOME, ".codeium/windsurf/skills"),
  },
  { label: "ZCode Workspace", scope: "workspace", dest: path.resolve("./.zcode/skills") },
  { label: "ZCode Global", scope: "global", dest: path.join(HOME, ".zcode/skills") },
];

/** Harnesses whose scope is valid for the selected install scope. */
export function getHarnessesForScope(scope: string): HarnessDestination[] {
  const harnessScope: HarnessScope | undefined =
    scope === "global" ? "global" : scope === "local" ? "workspace" : undefined;
  return HARNESS_DESTINATIONS.filter((harness) => !harnessScope || harness.scope === harnessScope);
}

export function findHarnessByLabel(label: string, scope: string): HarnessDestination | undefined {
  const normalized = label.toLowerCase();
  return getHarnessesForScope(scope).find((harness) => harness.label.toLowerCase() === normalized);
}

export interface DestinationGroup {
  dest: string;
  /** Labels the user selected that resolve to this destination. */
  labels: string[];
  includeAgentsFolder: boolean;
}

/**
 * Several harnesses read the same directory (for example Codex, Antigravity,
 * and the Agent Skills standard all use `.agents/skills`). Grouping by
 * destination keeps the installer from copying the same skills repeatedly and
 * preserves the `agents` folder when any Codex selection shares the path.
 */
export function groupByDest(harnesses: HarnessDestination[]): DestinationGroup[] {
  const groups = new Map<string, DestinationGroup>();
  for (const harness of harnesses) {
    const existing = groups.get(harness.dest);
    if (existing) {
      existing.labels.push(harness.label);
      existing.includeAgentsFolder ||= harness.includeAgentsFolder === true;
    } else {
      groups.set(harness.dest, {
        dest: harness.dest,
        labels: [harness.label],
        includeAgentsFolder: harness.includeAgentsFolder === true,
      });
    }
  }
  return Array.from(groups.values());
}

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
