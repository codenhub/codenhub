import { afterEach, describe, expect, it } from "vitest";

import {
  createAppError,
  createErrorRegistry,
  freezeRegistry,
  getErrorRegistry,
  setErrorRegistry,
  type ErrorRegistry,
  type ReadonlyErrorRegistry,
} from "./index";

const defaultRegistry = getErrorRegistry();

afterEach(() => {
  setErrorRegistry(defaultRegistry);
  defaultRegistry.clear();
});

describe("createErrorRegistry", () => {
  it("should create isolated blank registries", () => {
    const firstRegistry = createErrorRegistry();
    const secondRegistry = createErrorRegistry();

    firstRegistry.codes.add("invalid_credentials", {
      message: "Invalid email or password.",
      source: "my-app.auth",
    });

    expect(createAppError({ code: "invalid_credentials" }, { registry: firstRegistry })).toMatchObject({
      type: "known",
    });
    expect(createAppError({ code: "invalid_credentials" }, { registry: secondRegistry })).toMatchObject({
      type: "unknown",
    });
  });

  it("should merge preset registries on creation", () => {
    const firstPreset = createErrorRegistry();
    firstPreset.codes.add("code_one", { message: "Message one" });
    const secondPreset = createErrorRegistry();
    secondPreset.names.add("NameTwo", { message: "Message two" });

    const merged = createErrorRegistry([firstPreset, secondPreset]);

    expect(merged.codes.get("code_one")).toEqual({ message: "Message one" });
    expect(merged.names.get("NameTwo")).toEqual({ message: "Message two" });
  });

  it("should accept ReadonlyErrorRegistry presets", () => {
    const source = createErrorRegistry();
    source.codes.add("code_a", { message: "Message A" });
    const frozen: ReadonlyErrorRegistry = freezeRegistry(source);

    const merged = createErrorRegistry([frozen]);
    expect(merged.codes.get("code_a")).toEqual({ message: "Message A" });
  });

  it("should keep merge and clear callable when destructured", () => {
    const sourceRegistry = createErrorRegistry();
    const targetRegistry = createErrorRegistry();
    const { merge, clear } = targetRegistry;

    sourceRegistry.codes.add("invalid_credentials", { message: "Invalid email or password." });
    merge(sourceRegistry);

    expect(targetRegistry.codes.get("invalid_credentials")).toBeDefined();

    clear();

    expect(targetRegistry.codes.get("invalid_credentials")).toBeUndefined();
  });

  it("should merge all bucket types from source into target", () => {
    const source = createErrorRegistry();
    const target = createErrorRegistry();

    source.codes.add("500", { message: "Internal server error.", source: "server" });
    source.names.add("AbortError", { message: "Request cancelled.", source: "browser" });
    source.messages.add("Exact message", { message: "Matched message" });
    source.prefixes.add("Upload failed:", { message: "Upload failure." });
    source.patterns.add(/failed to fetch/gi, { message: "Network request failed.", isRetryable: true });

    target.merge(source);
    source.clear();

    expect(createAppError({ code: "500" }, { registry: target })).toMatchObject({
      type: "known",
      message: "Internal server error.",
    });
    expect(createAppError(new Error("failed to fetch"), { registry: target })).toMatchObject({
      type: "unexpected",
      message: "Network request failed.",
    });
  });

  it("should leave the target unchanged when a source bucket is invalid", () => {
    const target = createErrorRegistry();
    target.codes.add("existing", { message: "Existing" });
    const source = createErrorRegistry();
    source.codes.add("new", { message: "New" });
    const invalidSource = {
      ...source,
      prefixes: {
        values: () => [{ prefix: "!!!", message: "Invalid" }],
      },
    } as unknown as ReadonlyErrorRegistry;

    expect(() => target.merge(invalidSource)).toThrow(TypeError);
    expect(target.codes.get("existing")).toEqual({ message: "Existing" });
    expect(target.codes.get("new")).toBeUndefined();
  });
});

describe("getErrorRegistry / setErrorRegistry", () => {
  it("should return the same mutable global registry instance", () => {
    const registry = getErrorRegistry();
    expect(registry).toBe(getErrorRegistry());
  });

  it("should replace the active registry and affect createAppError", () => {
    const customRegistry = createErrorRegistry();
    customRegistry.codes.add("code_one", { message: "Custom message" });

    setErrorRegistry(customRegistry);
    expect(getErrorRegistry()).toBe(customRegistry);
    expect(createAppError({ code: "code_one" })).toMatchObject({
      type: "known",
      message: "Custom message",
    });
  });

  it("should reject a non-object registry value", () => {
    expect(() => setErrorRegistry(null as never)).toThrow(TypeError);
    expect(() => setErrorRegistry("invalid" as never)).toThrow(TypeError);
  });
});

describe("freezeRegistry", () => {
  it("should return a ReadonlyErrorRegistry that still allows reads", () => {
    const registry = createErrorRegistry();
    registry.codes.add("code1", { message: "Msg" });
    const frozen = freezeRegistry(registry);

    expect(frozen.codes.get("code1")).toEqual({ message: "Msg" });
    expect([...frozen.codes.values()]).toHaveLength(1);
  });

  it("should not expose mutation methods through property descriptors", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    expect(Object.getOwnPropertyDescriptor(frozen.codes, "add")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(frozen.prefixes, "clear")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(frozen.patterns, "delete")).toBeUndefined();
  });

  it("should omit mutation methods from frozen buckets", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    const mutableCodes = frozen.codes as unknown as ErrorRegistry["codes"];
    expect(mutableCodes.add).toBeUndefined();
    expect(mutableCodes.addList).toBeUndefined();
    expect(mutableCodes.clear).toBeUndefined();
    expect(mutableCodes.delete).toBeUndefined();

    const mutablePrefixes = frozen.prefixes as unknown as ErrorRegistry["prefixes"];
    expect(mutablePrefixes.add).toBeUndefined();
    expect(mutablePrefixes.addList).toBeUndefined();
    expect(mutablePrefixes.clear).toBeUndefined();
    expect(mutablePrefixes.delete).toBeUndefined();

    const mutablePatterns = frozen.patterns as unknown as ErrorRegistry["patterns"];
    expect(mutablePatterns.add).toBeUndefined();
    expect(mutablePatterns.addList).toBeUndefined();
    expect(mutablePatterns.clear).toBeUndefined();
    expect(mutablePatterns.delete).toBeUndefined();
  });

  it("should freeze each read-only bucket facade", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    expect(() => {
      Object.defineProperty(frozen.codes, "newProp", { value: "val" });
    }).toThrow(TypeError);
    expect(() => {
      Object.setPrototypeOf(frozen.codes, {});
    }).toThrow(TypeError);
    expect(Object.isFrozen(frozen.codes)).toBe(true);
  });

  it("should throw TypeError when a property is set on a frozen bucket", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    expect(() => {
      (frozen.codes as unknown as Record<string, unknown>).foo = "bar";
    }).toThrow(TypeError);
  });

  it("should snapshot the source registry when freezing", () => {
    const source = createErrorRegistry();
    source.codes.add("before", { message: "Before" });

    const frozen = freezeRegistry(source);
    source.codes.add("after", { message: "After" });

    expect(frozen.codes.get("before")).toEqual({ message: "Before" });
    expect(frozen.codes.get("after")).toBeUndefined();
  });

  it("should isolate prefix and pattern values from external mutation", () => {
    const registry = createErrorRegistry();
    registry.prefixes.add("Upload failed:", { message: "Original prefix" });
    registry.patterns.add(/network error/i, { message: "Original pattern" });

    const prefixValues = registry.prefixes.values();
    const patternValues = registry.patterns.values();

    (prefixValues[0] as { message: string }).message = "Mutated prefix";
    (prefixValues as unknown as Array<{ prefix: string; message: string }>).push({
      prefix: "Injected",
      message: "Injected prefix",
    });
    (patternValues[0] as { message: string }).message = "Mutated pattern";
    (patternValues as unknown as Array<{ pattern: RegExp; message: string }>).push({
      pattern: /injected/,
      message: "Injected pattern",
    });

    expect(registry.prefixes.values()).toHaveLength(1);
    expect(registry.prefixes.values()[0].message).toBe("Original prefix");
    expect(registry.patterns.values()).toHaveLength(1);
    expect(registry.patterns.values()[0].message).toBe("Original pattern");
  });

  it("should be usable as a preset source for createErrorRegistry", () => {
    const source = createErrorRegistry();
    source.codes.add("code_a", { message: "Message A" });
    const frozen = freezeRegistry(source);

    const merged = createErrorRegistry([frozen]);
    expect(merged.codes.get("code_a")).toEqual({ message: "Message A" });
  });

  it("should be usable as a source for registry.merge", () => {
    const source = createErrorRegistry();
    source.codes.add("code_b", { message: "Message B" });
    const frozen = freezeRegistry(source);

    const target = createErrorRegistry();
    target.merge(frozen);
    expect(target.codes.get("code_b")).toEqual({ message: "Message B" });
  });

  it("should reject structurally invalid global registries", () => {
    const activeRegistry = getErrorRegistry();

    try {
      expect(() => setErrorRegistry({} as unknown as ErrorRegistry)).toThrow(TypeError);
    } finally {
      setErrorRegistry(activeRegistry);
    }
  });
});
