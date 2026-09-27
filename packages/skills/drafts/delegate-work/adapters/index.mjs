import agy from "./agy.mjs";
import claude from "./claude.mjs";
import codex from "./codex.mjs";
import opencode from "./opencode.mjs";

// Harness name → adapter. Each adapter implements the interface in stub.mjs.
export const adapters = {
  opencode,
  codex,
  agy,
  claude,
};
export const harnessNames = Object.keys(adapters);
