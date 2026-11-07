import { spawn, spawnSync } from "node:child_process";
import type { Options } from "./args.ts";

export interface TaskConfig {
  setup: string[];
  targets: string[];
}

export interface TargetResult {
  command: string;
  ok: boolean;
}

export function runSetup(commands: string[]): void {
  for (const command of commands) {
    const result = spawnSync(command, { shell: true, stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`Setup command failed: ${command}`);
    }
  }
}

function runTarget(command: string): Promise<TargetResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: "inherit" });
    child.on("error", () => resolve({ command, ok: false }));
    child.on("close", (code) => resolve({ command, ok: code === 0 }));
  });
}

export async function runAll(config: TaskConfig, options: Options): Promise<TargetResult[]> {
  runSetup(config.setup);
  const results: TargetResult[] = [];
  for (const command of config.targets) {
    const result = await runTarget(command);
    results.push(result);
    if (!result.ok && options.bail) break;
  }
  return results;
}
