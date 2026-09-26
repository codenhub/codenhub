import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Harness adapters against event lines captured from real runs (agy 1.2.11),
 * trimmed to the fields the adapters read.
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
});
