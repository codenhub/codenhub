/** The subset of an mdast node the transform reads and writes. */
interface AstNode {
  children?: AstNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  type: string;
  value?: string;
}

const ALERTS = {
  NOTE: {
    intent: "info",
    title: "Note",
    icon: "<circle cx='12' cy='12' r='10'/><path d='M12 16v-4M12 8h.01'/>",
  },
  TIP: {
    intent: "success",
    title: "Tip",
    icon: "<path d='M9 18h6M10 22h4'/><path d='M8.4 14.5A7 7 0 1 1 15.6 14.5C14.6 15.3 14 16.1 14 17h-4c0-.9-.6-1.7-1.6-2.5Z'/>",
  },
  IMPORTANT: {
    intent: "important",
    title: "Important",
    icon: "<path d='M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'/><path d='M12 8v4M12 16h.01'/>",
  },
  WARNING: {
    intent: "warning",
    title: "Warning",
    icon: "<path d='m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z'/><path d='M12 9v4M12 17h.01'/>",
  },
  CAUTION: {
    intent: "destructive",
    title: "Caution",
    icon: "<path d='M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z'/><path d='M12 9v4M12 17h.01'/>",
  },
} as const;

type AlertType = keyof typeof ALERTS;

function createAlertTitle(type: AlertType): AstNode {
  const alert = ALERTS[type];
  return {
    type: "paragraph",
    data: { hProperties: { className: ["markdown-alert-title"] } },
    children: [
      {
        type: "html",
        value: `<svg aria-hidden="true" class="markdown-alert-icon" viewBox="0 0 24 24">${alert.icon}</svg>`,
      },
      { type: "text", value: alert.title },
    ],
  };
}

function transformBlockquote(node: AstNode): void {
  if (node.type !== "blockquote") {
    return;
  }
  const firstParagraph = node.children?.[0];
  const firstText = firstParagraph?.type === "paragraph" ? firstParagraph.children?.[0] : undefined;
  // The marker ends its line, as GitHub requires, or is followed by spaces and
  // the alert's text on the same line, a form GitHub renders as a plain quote
  // but some published READMEs use (codenhub/codenhub#395).
  const match =
    firstText?.type === "text"
      ? firstText.value?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]*(?:\r?\n|$)|[ \t]+)/)
      : undefined;
  if (match === undefined || match === null) {
    return;
  }

  const type = match[1] as AlertType;
  const alert = ALERTS[type];
  firstText!.value = firstText!.value!.slice(match[0].length);
  if (firstText!.value === "") {
    firstParagraph!.children!.shift();
  }
  if (firstParagraph!.children?.length === 0) {
    node.children!.shift();
  }

  node.data = {
    hName: "aside",
    hProperties: {
      className: ["markdown-alert", "alert", alert.intent],
      "data-alert-type": type.toLowerCase(),
    },
  };
  node.children!.unshift(createAlertTitle(type));
}

function visitTree(node: AstNode, visitor: (node: AstNode) => void): void {
  visitor(node);
  node.children?.forEach((child) => visitTree(child, visitor));
}

/**
 * Remark plugin that turns a GitHub-style alert blockquote, such as `> [!WARNING]`,
 * into an `<aside class="markdown-alert alert {intent}">` with an icon and title.
 * The host styles `.markdown-alert`, `.markdown-alert-title` and `.markdown-alert-icon`.
 */
export function remarkAlerts(): (tree: unknown) => void {
  return (tree) => visitTree(tree as AstNode, transformBlockquote);
}
