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
    ["a code with a message", { code: "a", message: "words" }],
    ["a code with a message key", { code: "a", messageKey: "error.a" }],
    ["a code with a source", { code: "a", source: "a" }],
    ["a code with isRetryable", { code: "a", isRetryable: true }],
  ])("rejects %s", (_label, mapping) => {
    const registry = createErrorRegistry();

    expect(() => registry.names.add("NotAllowedError", mapping as never)).toThrow(TypeError);
    expect(() => registry.patterns.add(/x/, mapping as never)).toThrow(TypeError);
    expect(() => registry.prefixes.add("x", mapping as never)).toThrow(TypeError);
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
