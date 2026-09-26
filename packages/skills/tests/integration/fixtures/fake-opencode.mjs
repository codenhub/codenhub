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
  const file = "src/a.txt";
  fs.appendFileSync(file, `${prompt.includes("FOLLOW-UP") ? "second" : "first"}\n`);
  const sessionID = "ses_fake";
  const emit = (ev) => console.log(JSON.stringify({ sessionID, ...ev }));
  emit({ type: "step_start", part: {} });
  emit({ type: "tool_use", part: { tool: "write", state: { status: "completed", input: { path: file } } } });
  if (prompt.includes("WRITE-IGNORED")) {
    fs.mkdirSync("build", { recursive: true });
    fs.writeFileSync("build/out.txt", "planted\n");
    emit({
      type: "tool_use",
      part: { tool: "write", state: { status: "completed", input: { path: "build/out.txt" } } },
    });
  }
  emit({ type: "text", part: { text: "RESULT\nstatus: done\nsummary: edited src/a.txt" } });
}
