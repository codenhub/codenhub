import { describe, expect, it } from "vitest";

import {
  createAppError,
  createErrorRegistry,
  DEFAULT_APP_ERROR_MESSAGE,
  freezeRegistry,
  type ErrorRegistry,
} from "./index";

const PERMISSION_DENIED = {
  message: "You don't have permission to change this folder.",
  messageKey: "error.workspace.permissionDenied",
  source: "workspace",
  isRetryable: false,
};

const createWorkspaceRegistry = (): ErrorRegistry => {
  const registry = createErrorRegistry();

  registry.codes.add("workspace.permissionDenied", PERMISSION_DENIED);
  registry.names.add("NotAllowedError", { code: "workspace.permissionDenied" });
  registry.patterns.add(/\(os error 5\)$/, { code: "workspace.permissionDenied" });
  registry.codes.add("EACCES", { code: "workspace.permissionDenied" });
  registry.messages.add("Permission denied", { code: "workspace.permissionDenied" });
  registry.prefixes.add("Access refused:", { code: "workspace.permissionDenied" });

  return registry;
};

describe("code aliases", () => {
  it.each([
    ["a name", Object.assign(new Error("blocked"), { name: "NotAllowedError" }), "known"],
    ["a pattern", "failed to open file at path: C:\\notes.md with error: Access is denied. (os error 5)", "heuristic"],
    ["a code", { code: "EACCES", message: "open failed" }, "known"],
    ["a message", new Error("Permission denied."), "known"],
    ["a prefix", new Error("Access refused: /tmp/notes.md"), "known"],
  ])("gives the same code and words when matched by %s", (_label, input, type) => {
    const error = createAppError(input, { registry: createWorkspaceRegistry() });

    expect(error).toMatchObject({ ...PERMISSION_DENIED, type, code: "workspace.permissionDenied" });
  });

  it("matches nothing when its code is not registered", () => {
    const registry = createErrorRegistry();
    registry.patterns.add(/denied/, { code: "workspace.missing" });

    expect(createAppError("Access is denied", { registry })).toMatchObject({
      type: "unknown",
      code: null,
      message: DEFAULT_APP_ERROR_MESSAGE,
    });
  });

  it("matches nothing when its code is itself an alias", () => {
    const registry = createErrorRegistry();
    registry.codes.add("a", { code: "b" });
    registry.codes.add("b", PERMISSION_DENIED);
    registry.names.add("NotAllowedError", { code: "a" });

    expect(createAppError({ name: "NotAllowedError" }, { registry }).type).toBe("unknown");
  });

  it("passes over an unresolved alias to the next rule that matches", () => {
    const registry = createWorkspaceRegistry();
    registry.patterns.clear();
    registry.patterns.add(/denied/, { code: "workspace.missing" });
    registry.patterns.add(/\(os error 5\)$/, { code: "workspace.permissionDenied" });
    registry.prefixes.add("Access refused: /tmp", { code: "workspace.missing" });

    expect(createAppError("Access is denied. (os error 5)", { registry }).code).toBe("workspace.permissionDenied");
    expect(createAppError(new Error("Access refused: /tmp/notes.md"), { registry }).code).toBe(
      "workspace.permissionDenied",
    );
  });

  it("uses the words registered when the error is created, not when the alias was added", () => {
    const registry = createErrorRegistry();
    registry.names.add("NotAllowedError", { code: "workspace.permissionDenied" });
    registry.codes.add("workspace.permissionDenied", PERMISSION_DENIED);

    expect(createAppError({ name: "NotAllowedError" }, { registry }).message).toBe(PERMISSION_DENIED.message);
  });

  it("is stored trimmed, frozen, and with nothing but its code", () => {
    const registry = createErrorRegistry();
    registry.names.add("NotAllowedError", { code: "  workspace.permissionDenied  " });

    const alias = registry.names.get("NotAllowedError");

    expect(alias).toStrictEqual({ code: "workspace.permissionDenied" });
    expect(Object.isFrozen(alias)).toBe(true);
  });

  it.each([
    ["an empty code", { code: " " }],
    ["a code that is not a string", { code: 5 }],
    ["a code with a message key", { code: "a", messageKey: "error.a" }],
    ["a code with a source", { code: "a", source: "a" }],
    ["a code with isRetryable", { code: "a", isRetryable: true }],
  ])("rejects %s", (_label, mapping) => {
    const registry = createErrorRegistry();

    expect(() => registry.names.add("NotAllowedError", mapping as never)).toThrow(TypeError);
    expect(() => registry.patterns.add(/x/, mapping as never)).toThrow(TypeError);
    expect(() => registry.prefixes.add("x", mapping as never)).toThrow(TypeError);
  });

  // A row read from a table often carries its own code beside the words; 0.3.0 ignored that field.
  it("treats an entry with a message as feedback and ignores its code", () => {
    const rows = [{ code: "23505", message: "Already exists.", messageKey: "error.db.duplicate" }];
    const registry = createErrorRegistry();

    registry.codes.addList(rows.map((row) => [row.code, row as never] as const));
    registry.patterns.add(/duplicate/, rows[0] as never);
    registry.prefixes.add("Duplicate:", rows[0] as never);

    expect(registry.codes.get("23505")).toStrictEqual({ message: "Already exists.", messageKey: "error.db.duplicate" });
    expect(registry.patterns.values()[0]).not.toHaveProperty("code");
    expect(registry.prefixes.values()[0]).not.toHaveProperty("code");
    expect(createAppError({ code: "23505" }, { registry })).toMatchObject({
      code: "23505",
      message: "Already exists.",
    });
    expect(createAppError("a duplicate key", { registry })).toMatchObject({ code: null, message: "Already exists." });
  });

  it("reads aliases and words from a hand-written registry as from a built-in one", () => {
    const feedback = { code: "elsewhere", message: "Hand-written words." };
    const none = { get: () => undefined, values: () => [] };
    const registry = {
      codes: { get: (code: string) => (code === "E1" ? feedback : undefined), values: () => [] },
      names: none,
      messages: none,
      prefixes: { values: () => [] },
      patterns: {
        values: () => [
          { code: "missing", pattern: /alias/ },
          { code: "E1", pattern: /alias/ },
          { ...feedback, pattern: /hand/ },
        ],
      },
    };

    expect(createAppError("an alias", { registry: registry as never })).toMatchObject({
      type: "heuristic",
      code: "E1",
      message: "Hand-written words.",
    });

    expect(createAppError({ code: "E1" }, { registry: registry as never })).toMatchObject({
      type: "known",
      code: "E1",
      message: "Hand-written words.",
    });
    expect(createAppError("hand", { registry: registry as never })).toMatchObject({
      type: "heuristic",
      code: null,
      message: "Hand-written words.",
    });
  });

  it("survives merge and freezeRegistry", () => {
    const merged = createErrorRegistry([freezeRegistry(createWorkspaceRegistry())]);

    expect(merged.patterns.values()[0]).toMatchObject({ code: "workspace.permissionDenied" });
    expect(createAppError("(os error 5)", { registry: merged }).code).toBe("workspace.permissionDenied");
  });

  it("lets a recognizing registry and a wording registry combine through merge", () => {
    const recognizing = createErrorRegistry();
    recognizing.patterns.add(/\(os error 5\)$/, { code: "workspace.permissionDenied" });
    const wording = createErrorRegistry();
    wording.codes.add("workspace.permissionDenied", PERMISSION_DENIED);

    const registry = createErrorRegistry([freezeRegistry(recognizing), freezeRegistry(wording)]);

    expect(createAppError("Access is denied. (os error 5)", { registry })).toMatchObject({
      type: "heuristic",
      code: "workspace.permissionDenied",
      message: PERMISSION_DENIED.message,
    });
  });

  it("serializes the alias code like any other", () => {
    const error = createAppError({ name: "NotAllowedError" }, { registry: createWorkspaceRegistry() });

    expect(JSON.parse(JSON.stringify(error))).toMatchObject({ code: "workspace.permissionDenied" });
  });
});
