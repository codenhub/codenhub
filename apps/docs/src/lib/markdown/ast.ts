export interface AstNode {
  children?: AstNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
}

export function getNodeText(node: AstNode): string {
  if (node.type === "text") {
    return node.value ?? "";
  }
  return node.children?.map(getNodeText).join("") ?? "";
}
