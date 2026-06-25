import { describe, it, expect } from "vitest";

import { arrayPluralRule } from "../src/rules/array-plural";
import { booleanPrefixRule, type ASTNode, type RuleContext } from "../src/rules/boolean-prefix";

interface ReportDescriptor {
  node: ASTNode;
  messageId: string;
  data?: Record<string, string | number>;
}

describe("boolean-prefix rule", () => {
  const createRuleInstance = (reports: ReportDescriptor[]) => {
    const context: RuleContext = {
      report(descriptor) {
        reports.push(descriptor);
      },
    };
    return booleanPrefixRule.create(context);
  };

  it("should allow valid boolean variables", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const validVariables = [
      { id: { type: "Identifier", name: "isLoading" }, init: { type: "Literal", value: true } },
      {
        id: { type: "Identifier", name: "hasPermission" },
        init: { type: "BinaryExpression", operator: "===", left: {}, right: {} },
      },
      { id: { type: "Identifier", name: "canWrite" }, init: { type: "UnaryExpression", operator: "!", argument: {} } },
      {
        id: { type: "Identifier", name: "shouldUpdate" },
        init: { type: "LogicalExpression", operator: "&&", left: {}, right: { type: "Literal", value: true } },
      },
      { id: { type: "Identifier", name: "is" }, init: { type: "Literal", value: false } },
      { id: { type: "Identifier", name: "is_ready" }, init: { type: "Literal", value: true } },
      { id: { type: "Identifier", name: "has3Attempts" }, init: { type: "Literal", value: true } },
    ];

    for (const node of validVariables) {
      listeners.VariableDeclarator?.(node as unknown as ASTNode);
    }

    expect(reports).toHaveLength(0);
  });

  it("should flag invalid boolean variables", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const invalidVariables = [
      { id: { type: "Identifier", name: "loading" }, init: { type: "Literal", value: true } },
      {
        id: { type: "Identifier", name: "permission" },
        init: { type: "BinaryExpression", operator: "===", left: {}, right: {} },
      },
      { id: { type: "Identifier", name: "write" }, init: { type: "UnaryExpression", operator: "!", argument: {} } },
      {
        id: { type: "Identifier", name: "update" },
        init: { type: "LogicalExpression", operator: "&&", left: {}, right: { type: "Literal", value: true } },
      },
      { id: { type: "Identifier", name: "issue" }, init: { type: "Literal", value: true } },
      { id: { type: "Identifier", name: "canvas" }, init: { type: "Literal", value: true } },
      { id: { type: "Identifier", name: "shoulders" }, init: { type: "Literal", value: true } },
    ];

    for (const node of invalidVariables) {
      listeners.VariableDeclarator?.(node as unknown as ASTNode);
    }

    expect(reports).toHaveLength(invalidVariables.length);
    expect(reports[0].data?.name).toBe("loading");
    expect(reports[0].messageId).toBe("booleanPrefix");
  });

  it("should ignore non-boolean variables", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const nonBooleans = [
      { id: { type: "Identifier", name: "name" }, init: { type: "Literal", value: "Alice" } },
      { id: { type: "Identifier", name: "count" }, init: { type: "Literal", value: 42 } },
      {
        id: { type: "Identifier", name: "data" },
        init: { type: "CallExpression", callee: { type: "Identifier", name: "getData" }, arguments: [] },
      },
      { id: { type: "Identifier", name: "loading" }, init: null },
      {
        id: { type: "Identifier", name: "item" },
        init: {
          type: "LogicalExpression",
          operator: "&&",
          left: { type: "Identifier", name: "options" },
          right: {
            type: "MemberExpression",
            object: { type: "Identifier", name: "options" },
            property: { type: "Identifier", name: "item" },
          },
        },
      },
    ];

    for (const node of nonBooleans) {
      listeners.VariableDeclarator?.(node as unknown as ASTNode);
    }

    expect(reports).toHaveLength(0);
  });

  it("should check object properties", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const validProps = [
      {
        kind: "init",
        method: false,
        computed: false,
        key: { type: "Identifier", name: "isLoading" },
        value: { type: "Literal", value: true },
      },
      {
        kind: "init",
        method: false,
        computed: false,
        key: { type: "Literal", value: "hasPermission" },
        value: { type: "Literal", value: true },
      },
    ];

    const invalidProps = [
      {
        kind: "init",
        method: false,
        computed: false,
        key: { type: "Identifier", name: "loading" },
        value: { type: "Literal", value: true },
      },
      {
        kind: "init",
        method: false,
        computed: false,
        key: { type: "Literal", value: "permission" },
        value: { type: "Literal", value: true },
      },
    ];

    const ignoredProps = [
      { kind: "get", method: true, computed: false, key: { type: "Identifier", name: "loading" }, value: {} }, // getter/method
      {
        kind: "init",
        method: false,
        computed: true,
        key: { type: "Identifier", name: "loading" },
        value: { type: "Literal", value: true },
      }, // computed
    ];

    for (const node of validProps) {
      listeners.Property?.(node as unknown as ASTNode);
    }
    expect(reports).toHaveLength(0);

    for (const node of invalidProps) {
      listeners.Property?.(node as unknown as ASTNode);
    }
    expect(reports).toHaveLength(2);
    expect(reports[0].data?.name).toBe("loading");
    expect(reports[1].data?.name).toBe("permission");

    reports.length = 0;
    for (const node of ignoredProps) {
      listeners.Property?.(node as unknown as ASTNode);
    }
    expect(reports).toHaveLength(0);
  });

  it("should check class properties", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const validProps = [
      { computed: false, key: { type: "Identifier", name: "isLoading" }, value: { type: "Literal", value: true } },
    ];

    const invalidProps = [
      { computed: false, key: { type: "Identifier", name: "loading" }, value: { type: "Literal", value: true } },
    ];

    for (const node of validProps) {
      listeners.PropertyDefinition?.(node as unknown as ASTNode);
    }
    expect(reports).toHaveLength(0);

    for (const node of invalidProps) {
      listeners.PropertyDefinition?.(node as unknown as ASTNode);
    }
    expect(reports).toHaveLength(1);
    expect(reports[0].data?.name).toBe("loading");
  });

  it("should check variable declarations with TS boolean type annotations", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const validNode = {
      id: {
        type: "Identifier",
        name: "isActive",
        typeAnnotation: {
          type: "TSTypeAnnotation",
          typeAnnotation: { type: "TSBooleanKeyword" },
        },
      },
      init: null,
    };

    const invalidNode = {
      id: {
        type: "Identifier",
        name: "active",
        typeAnnotation: {
          type: "TSTypeAnnotation",
          typeAnnotation: { type: "TSBooleanKeyword" },
        },
      },
      init: null,
    };

    listeners.VariableDeclarator?.(validNode as unknown as ASTNode);
    expect(reports).toHaveLength(0);

    listeners.VariableDeclarator?.(invalidNode as unknown as ASTNode);
    expect(reports).toHaveLength(1);
    expect(reports[0].data?.name).toBe("active");
  });

  it("should check class properties with TS boolean type annotations", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const validProp = {
      computed: false,
      key: { type: "Identifier", name: "isActive" },
      typeAnnotation: {
        type: "TSTypeAnnotation",
        typeAnnotation: { type: "TSBooleanKeyword" },
      },
      value: null,
    };

    const invalidProp = {
      computed: false,
      key: { type: "Identifier", name: "active" },
      typeAnnotation: {
        type: "TSTypeAnnotation",
        typeAnnotation: { type: "TSBooleanKeyword" },
      },
      value: null,
    };

    listeners.PropertyDefinition?.(validProp as unknown as ASTNode);
    expect(reports).toHaveLength(0);

    listeners.PropertyDefinition?.(invalidProp as unknown as ASTNode);
    expect(reports).toHaveLength(1);
    expect(reports[0].data?.name).toBe("active");
  });

  it("should check interface and type properties with TS boolean type annotations", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const validProp = {
      computed: false,
      key: { type: "Identifier", name: "isActive" },
      typeAnnotation: {
        type: "TSTypeAnnotation",
        typeAnnotation: { type: "TSBooleanKeyword" },
      },
    };

    const invalidProp = {
      computed: false,
      key: { type: "Identifier", name: "active" },
      typeAnnotation: {
        type: "TSTypeAnnotation",
        typeAnnotation: { type: "TSBooleanKeyword" },
      },
    };

    listeners.TSPropertySignature?.(validProp as unknown as ASTNode);
    expect(reports).toHaveLength(0);

    listeners.TSPropertySignature?.(invalidProp as unknown as ASTNode);
    expect(reports).toHaveLength(1);
    expect(reports[0].data?.name).toBe("active");
  });
});

describe("array-plural rule", () => {
  const createRuleInstance = (reports: ReportDescriptor[]) => {
    const context: RuleContext = {
      report(descriptor) {
        reports.push(descriptor);
      },
    };
    return arrayPluralRule.create(context);
  };

  it("should allow plural array variables", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const validArrays = [
      // Literal array
      { id: { type: "Identifier", name: "items" }, init: { type: "ArrayExpression", elements: [] } },
      // New Array
      {
        id: { type: "Identifier", name: "users" },
        init: { type: "NewExpression", callee: { type: "Identifier", name: "Array" } },
      },
      // Array Call
      {
        id: { type: "Identifier", name: "activeKeys" },
        init: { type: "CallExpression", callee: { type: "Identifier", name: "Array" } },
      },
      // Array.from
      {
        id: { type: "Identifier", name: "values" },
        init: {
          type: "CallExpression",
          callee: {
            type: "MemberExpression",
            object: { type: "Identifier", name: "Array" },
            property: { type: "Identifier", name: "from" },
          },
        },
      },
      // Array.of
      {
        id: { type: "Identifier", name: "elements" },
        init: {
          type: "CallExpression",
          callee: {
            type: "MemberExpression",
            object: { type: "Identifier", name: "Array" },
            property: { type: "Identifier", name: "of" },
          },
        },
      },
      // TS type annotation: TSArrayType
      {
        id: {
          type: "Identifier",
          name: "names",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: { type: "TSArrayType" },
          },
        },
        init: null,
      },
      // TS type annotation: TSTypeReference
      {
        id: {
          type: "Identifier",
          name: "records",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: {
              type: "TSTypeReference",
              typeName: { type: "Identifier", name: "Array" },
            },
          },
        },
        init: null,
      },
      // Irregular plurals
      { id: { type: "Identifier", name: "children" }, init: { type: "ArrayExpression", elements: [] } },
      { id: { type: "Identifier", name: "people" }, init: { type: "ArrayExpression", elements: [] } },
      // Collective suffixes
      { id: { type: "Identifier", name: "itemList" }, init: { type: "ArrayExpression", elements: [] } },
      { id: { type: "Identifier", name: "userGroup" }, init: { type: "ArrayExpression", elements: [] } },
      { id: { type: "Identifier", name: "dataSet" }, init: { type: "ArrayExpression", elements: [] } },
    ];

    for (const node of validArrays) {
      listeners.VariableDeclarator?.(node as unknown as ASTNode);
    }

    expect(reports).toHaveLength(0);
  });

  it("should flag non-plural array variables", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const invalidArrays = [
      { id: { type: "Identifier", name: "item" }, init: { type: "ArrayExpression", elements: [] } },
      {
        id: { type: "Identifier", name: "user" },
        init: { type: "NewExpression", callee: { type: "Identifier", name: "Array" } },
      },
      {
        id: { type: "Identifier", name: "activeKey" },
        init: { type: "CallExpression", callee: { type: "Identifier", name: "Array" } },
      },
      {
        id: { type: "Identifier", name: "value" },
        init: {
          type: "CallExpression",
          callee: {
            type: "MemberExpression",
            object: { type: "Identifier", name: "Array" },
            property: { type: "Identifier", name: "from" },
          },
        },
      },
      {
        id: {
          type: "Identifier",
          name: "name",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: { type: "TSArrayType" },
          },
        },
        init: null,
      },
      {
        id: {
          type: "Identifier",
          name: "record",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: {
              type: "TSTypeReference",
              typeName: { type: "Identifier", name: "ReadonlyArray" },
            },
          },
        },
        init: null,
      },
    ];

    for (const node of invalidArrays) {
      listeners.VariableDeclarator?.(node as unknown as ASTNode);
    }

    expect(reports).toHaveLength(invalidArrays.length);
    expect(reports[0].data?.name).toBe("item");
    expect(reports[0].messageId).toBe("arrayPlural");
  });

  it("should ignore non-array variables", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    const nonArrays = [
      { id: { type: "Identifier", name: "user" }, init: { type: "Literal", value: "Alice" } },
      {
        id: {
          type: "Identifier",
          name: "config",
          typeAnnotation: {
            type: "TSTypeAnnotation",
            typeAnnotation: {
              type: "TSTypeReference",
              typeName: { type: "Identifier", name: "Config" },
            },
          },
        },
        init: null,
      },
    ];

    for (const node of nonArrays) {
      listeners.VariableDeclarator?.(node as unknown as ASTNode);
    }

    expect(reports).toHaveLength(0);
  });

  it("should check properties (class, interface, object)", () => {
    const reports: ReportDescriptor[] = [];
    const listeners = createRuleInstance(reports);

    // Class Property
    listeners.PropertyDefinition?.({
      computed: false,
      key: { type: "Identifier", name: "item" },
      value: { type: "ArrayExpression", elements: [] },
    } as unknown as ASTNode);
    expect(reports).toHaveLength(1);
    expect(reports[0].data?.name).toBe("item");
    reports.length = 0;

    // Interface Property
    listeners.TSPropertySignature?.({
      computed: false,
      key: { type: "Identifier", name: "record" },
      typeAnnotation: {
        type: "TSTypeAnnotation",
        typeAnnotation: { type: "TSArrayType" },
      },
    } as unknown as ASTNode);
    expect(reports).toHaveLength(1);
    expect(reports[0].data?.name).toBe("record");
    reports.length = 0;

    // Object Property
    listeners.Property?.({
      kind: "init",
      method: false,
      computed: false,
      key: { type: "Identifier", name: "value" },
      value: { type: "ArrayExpression", elements: [] },
    } as unknown as ASTNode);
    expect(reports).toHaveLength(1);
    expect(reports[0].data?.name).toBe("value");
  });
});
