// ---------------------------------------------------------------------------
// AST node types — aligned with the interfaces used by sibling plugins
// ---------------------------------------------------------------------------

export interface ASTNode {
  type: string;
  parent?: ASTNode;
  value?: unknown;
  name?: string;
  property?: ASTNode;
  expression?: ASTNode;
  object?: ASTNode;
  callee?: ASTNode;
  key?: ASTNode;
  left?: ASTNode;
  right?: ASTNode;
  operator?: string;
  source?: ASTNode;
  test?: ASTNode;
  discriminant?: ASTNode;
  arguments?: ASTNode[];
  quasis?: { value: { cooked: string | null } }[];
  expressions?: ASTNode[];
  [key: string]: unknown;
}

export interface RuleContext {
  report(descriptor: { node: ASTNode; messageId: string; data?: Record<string, string | number> }): void;
}

export interface RuleModule {
  meta: {
    type: "problem" | "suggestion" | "layout";
    docs: {
      description: string;
      category?: string;
      recommended?: boolean;
      url?: string;
    };
    schema: unknown[];
    messages: Record<string, string>;
  };
  create(context: RuleContext): Record<string, (node: ASTNode) => void>;
}
