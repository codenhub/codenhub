import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Harness adapters against event lines captured from real runs (agy 1.2.11,
 * OpenCode 2.0.17), trimmed to the fields the adapters read.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const adapter = (name: string) => path.resolve(here, `../../skills/delegate-work/adapters/${name}.mjs`);
const state = path.join(os.tmpdir(), "delegate-work-adapters-test");
const newAcc = () => ({ sessionId: null, edits: [], denied: [], texts: [], stepTexts: [], errors: [], steps: 0 });

beforeAll(() => {
  // The agy adapter keeps its worker home under the state dir.
  process.env.DELEGATE_WORK_STATE = state;
});

afterAll(() => {
  fs.rmSync(state, { recursive: true, force: true });
});

describe("agy adapter", () => {
  const wt = "C:\\work\\wt";
  const lines = [
    { event: "init", conversation_id: "c1", init: { cwd: wt } },
    {
      event: "step_update",
      step_update: {
        step_index: 2,
        state: "ACTIVE",
        step_type: "tool",
        tool_name: "replace_file_content",
        tool_info: { parameters: { TargetFile: `${wt}\\src\\math.mjs` } },
      },
    },
    {
      event: "step_update",
      step_update: {
        step_index: 2,
        state: "DONE",
        step_type: "tool",
        tool_name: "replace_file_content",
        tool_info: { parameters: { TargetFile: `${wt}\\src\\math.mjs` } },
      },
    },
    {
      event: "step_update",
      step_update: {
        step_index: 4,
        state: "ERROR",
        step_type: "tool",
        tool_name: "list_dir",
        tool_info: {
          parameters: { DirectoryPath: "C:\\Users\\me\\other" },
          error: {
            message: 'permission check failed for read_file "C:\\\\Users\\\\me\\\\other": user denied permission',
          },
        },
      },
    },
    {
      event: "step_update",
      step_update: { step_index: 5, step_type: "agent_response", text_delta: "RESULT\nstatus: " },
    },
    { event: "step_update", step_update: { step_index: 5, step_type: "agent_response", text_delta: "done\n" } },
    { event: "result", result: { conversation_id: "c1", status: "SUCCESS", response: "RESULT\nstatus: done\n" } },
  ];

  it("shouldReportEditsDenialsAndTheLastMessageFromAStream", async () => {
    const { default: agy } = await import(adapter("agy"));
    const acc = newAcc();
    for (const l of lines) {
      agy.parseLine(JSON.stringify(l), acc);
    }
    agy.parseStderr(
      'jetski: no output produced — a tool required the "read_file" permission that headless mode cannot prompt for',
      acc,
    );

    expect(acc.sessionId).toBe("c1");
    expect(acc.edits).toEqual([`${wt}\\src\\math.mjs`]);
    expect(acc.steps).toBe(1);
    expect(acc.denied).toEqual([
      "list_dir: C:\\Users\\me\\other",
      "read_file: needs approval, which headless agy can't ask for; the worker's session ended there",
    ]);
    expect(agy.finalText(acc)).toBe("RESULT\nstatus: done\n");
    expect(agy.classify({ code: 0, acc, stderrTail: "" }).kind).toBe("ok");
  });

  it("shouldClassifyUnavailableServiceAndUnknownModelFailures", async () => {
    const { default: agy } = await import(adapter("agy"));
    const failed = (error: string) => {
      const acc = newAcc();
      agy.parseLine(JSON.stringify({ event: "result", result: { status: "ERROR", error } }), acc);
      return agy.classify({ code: 1, acc, stderrTail: "" }).kind;
    };

    expect(failed("Eligibility check failed: UNAVAILABLE (code 503): The service is currently unavailable.")).toBe(
      "transient",
    );
    expect(failed('invalid model selection (--model "x"): model x is not recognized as a known model')).toBe(
      "unavailable",
    );
  });

  it("shouldDenyWritesToDependencyFoldersForEditingWorkersOnly", async () => {
    const { default: agy } = await import(adapter("agy"));
    const work = fs.mkdtempSync(path.join(state, "work-"));
    const grants = (readOnly: boolean) => {
      const { args } = agy.command({
        route: { model: "m" },
        cwd: work,
        prompt: "p",
        readOnly,
        allow: ["src/a.txt"],
        bashAllow: ["npm run test"],
        depDirs: ["node_modules", "pkg/node_modules"],
        sessionId: null,
      });
      const id = args[args.indexOf("--project") + 1];
      const file = path.join(state, "agy-home", ".gemini", "config", "projects", `${id}.json`);
      return JSON.parse(fs.readFileSync(file, "utf8")).permissionGrants.permissionGrants;
    };
    const dir = fs.realpathSync.native(work);

    const edit = grants(false);
    expect(edit.allow).toContain(`write_file(${dir})`);
    expect(edit.deny).toEqual(
      expect.arrayContaining([
        `write_file(${path.join(dir, "node_modules")})`,
        `write_file(${path.join(dir, "pkg", "node_modules")})`,
      ]),
    );
    expect(grants(true).deny.filter((d: string) => d.includes("node_modules"))).toEqual([]);

    // Setting up the shared home again rewrites nothing and leaves no temp files.
    grants(false);
    const leftovers = fs
      .readdirSync(path.join(state, "agy-home"), { recursive: true })
      .filter((f) => String(f).endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});

describe("codex adapter", () => {
  it("shouldLeaveTheTempDirOutWhenALinkedDependencyFolderResolvesIntoIt", async () => {
    const { default: codex } = await import(adapter("codex"));
    const work = fs.mkdtempSync(path.join(state, "wt-"));
    const deps = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-work-deps-"));
    fs.symlinkSync(deps, path.join(work, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const args = (depDirs: string[], readOnly = false) =>
      codex.command({ route: { model: "m" }, cwd: work, prompt: "p", readOnly, depDirs, sessionId: null }).args;

    try {
      expect(args(["node_modules"])).toContain("sandbox_workspace_write.exclude_tmpdir_env_var=true");
      expect(args([])).not.toContain("sandbox_workspace_write.exclude_tmpdir_env_var=true");
      expect(args(["node_modules"], true)).not.toContain("sandbox_workspace_write.exclude_tmpdir_env_var=true");
    } finally {
      fs.unlinkSync(path.join(work, "node_modules"));
      fs.rmSync(deps, { recursive: true, force: true });
    }
  });

  it("shouldReportWritesTheSandboxRefusedEvenWhenTheCommandExitedCleanly", async () => {
    const { default: codex } = await import(adapter("codex"));
    const acc = newAcc();
    const shell = {
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "powershell.exe -Command 'Add-Content -LiteralPath x -Value y'",
        exit_code: 0,
        aggregated_output: "Add-Content : Access to the path \r\n'C:\\wt\\node_modules\\x' is denied.",
      },
    };
    codex.parseLine(JSON.stringify(shell), acc);
    codex.parseStderr("Output:\nFailed to write file C:\\wt\\node_modules\\README.md\n", acc);

    expect(acc.denied).toEqual([
      "shell: Add-Content -LiteralPath x -Value y",
      "apply_patch: C:\\wt\\node_modules\\README.md",
    ]);
  });
});

describe("opencode adapter (2.x events)", () => {
  it("shouldReadPatchedFilesFromToolMetadata", async () => {
    const { default: opencode } = await import(adapter("opencode"));
    const acc = newAcc();
    const patch = {
      type: "tool_use",
      sessionID: "ses_1",
      part: {
        tool: "patch",
        state: {
          status: "completed",
          input: { patchText: "*** Begin Patch\n*** Update File: src/text.mjs\n*** End Patch" },
          metadata: { metadata: { files: [{ file: "src/text.mjs", status: "modified" }] } },
        },
      },
    };
    opencode.parseLine(JSON.stringify(patch), acc);

    expect(acc.sessionId).toBe("ses_1");
    expect(acc.edits).toEqual(["src/text.mjs"]);
  });

  it("shouldTreatARunStoppedByAPermissionPromptAsTheWorkersOutcome", async () => {
    const { default: opencode } = await import(adapter("opencode"));
    const acc = newAcc();
    const events = [
      {
        type: "tool_use",
        part: {
          tool: "shell",
          state: { status: "error", input: { command: "node -v" }, error: "Permission denied: shell" },
        },
      },
      {
        type: "tool_use",
        part: {
          tool: "read",
          state: { status: "error", input: { path: "../x" }, error: "Tool execution interrupted" },
        },
      },
      { type: "error", error: { type: "aborted", message: "Step interrupted" } },
    ];
    for (const e of events) {
      opencode.parseLine(JSON.stringify(e), acc);
    }

    expect(acc.denied).toEqual([
      "shell: node -v",
      "read: ../x (needs approval, which opencode run can't ask for; the run stopped there)",
    ]);
    expect(opencode.classify({ code: 1, acc, stderrTail: "" }).kind).toBe("ok");
  });

  it("shouldClassifyAFreeTierQuotaErrorAsARateLimitWithItsRetryDelay", async () => {
    const { default: opencode } = await import(adapter("opencode"));
    const acc = newAcc();
    const error = {
      type: "provider.quota",
      status: 429,
      message:
        "You exceeded your current quota, please check your plan and billing details.\nPlease retry in 32.643304145s.",
    };
    opencode.parseLine(JSON.stringify({ type: "error", error }), acc);

    expect(opencode.classify({ code: 1, acc, stderrTail: "" })).toMatchObject({
      kind: "rate_limit",
      retryAfterMs: 32644,
    });
  });
});
