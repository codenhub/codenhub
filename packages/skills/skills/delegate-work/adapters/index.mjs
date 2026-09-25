import claude from "./claude.mjs";
import codex from "./codex.mjs";
import opencode from "./opencode.mjs";
import { stub } from "./stub.mjs";

// Harness name → adapter. Each adapter implements the interface in stub.mjs.
export const adapters = {
  opencode,
  codex,
  agy: stub("agy"),
  claude,
};
export const harnessNames = Object.keys(adapters);
