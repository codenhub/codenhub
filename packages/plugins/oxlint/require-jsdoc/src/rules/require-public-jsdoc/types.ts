export interface ASTNode {
  type: string;
  id?: ASTNode;
  name?: string;
  parent?: ASTNode;
  declaration?: ASTNode;
  declarations?: ASTNode[];
  properties?: ASTNode[];
  elements?: (ASTNode | null)[];
  key?: ASTNode;
  value?: ASTNode;
  argument?: ASTNode;
  left?: ASTNode;
  leadingComments?: { type: string; value: string }[];
  [key: string]: unknown;
}

export interface RuleContext {
  filename?: string;
  getFilename?(): string;
  report(descriptor: { node: ASTNode; messageId: string; data?: Record<string, string | number> }): void;
  sourceCode?: {
    getCommentsBefore(node: ASTNode): { type: string; value: string }[];
  };
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
