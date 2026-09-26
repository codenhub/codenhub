// Stands in for the `opencode` CLI (2.x) in delegate-work tests: answers the
// calls the adapter makes and, for `run`, edits the first allowed file and
// streams the JSON events a real run would.
import fs from "node:fs";

const [cmd] = process.argv.slice(2);

if (cmd === "--version") {
  console.log("opencode v2.0.0");
} else if (cmd === "models") {
  console.log("fake/model");
} else if (cmd === "run") {
  const prompt = fs.readFileSync(0, "utf8");
  const sessionID = "ses_fake";
  const emit = (ev) => console.log(JSON.stringify({ sessionID, ...ev }));
  emit({ type: "step_start", part: {} });
  if (prompt.includes("read-only task")) {
    const report = prompt.includes("SHORT") ? "one finding" : `${"finding\n".repeat(600)}end of report`;
    const verdict = prompt.match(/VERDICT (\S+)/)?.[1];
    const text = `RESULT\nstatus: done\nsummary: read the code\n${verdict ? `verdict: ${verdict}\n` : ""}report:\n${report}`;
    emit({ type: "text", part: { text } });
    process.exit(0);
  }
  const file = "src/a.txt";
  fs.appendFileSync(file, `${prompt.includes("FOLLOW-UP") ? "second" : "first"}\n`);
  emit({ type: "tool_use", part: { tool: "write", state: { status: "completed", input: { path: file } } } });
  // A route that edits, then fails as a provider would.
  if (process.argv.includes("fake/broken")) {
    emit({ type: "error", error: { type: "provider", status: 503, message: "The service is currently unavailable." } });
    process.exit(1);
  }
  const link = prompt.match(/MAKE-LINK (\S+)/);
  if (link) {
    fs.symlinkSync(link[1], "src/j", process.platform === "win32" ? "junction" : "dir");
  }
  if (prompt.includes("REPOINT-GIT")) {
    // Git hides the file on Windows, and a hidden file can't be overwritten.
    fs.rmSync(".git");
    fs.writeFileSync(".git", "gitdir: ../planted\n");
  }
  if (prompt.includes("WRITE-IGNORED")) {
    fs.mkdirSync("build", { recursive: true });
    fs.writeFileSync("build/out.txt", "planted\n");
    emit({
      type: "tool_use",
      part: { tool: "write", state: { status: "completed", input: { path: "build/out.txt" } } },
    });
  }
  const env = ["DW_TOKEN", "DW_PASSED_TOKEN", "DW_PLAIN", "pnpm_config_verify_deps_before_run"].map(
    (k) => `${k}=${process.env[k] ?? "unset"}`,
  );
  emit({ type: "text", part: { text: `RESULT\nstatus: done\nsummary: edited src/a.txt; ${env.join(" ")}` } });
}
