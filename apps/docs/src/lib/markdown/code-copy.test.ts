import { describe, expect, it, vi } from "vitest";

import { findCodeCopyStatus } from "./code-copy";

describe("findCodeCopyStatus", () => {
  it("resolves the status only within the nearest code block", () => {
    const localStatus = { id: "code-copy-status-1", textContent: "" };
    const localContainer = { querySelector: vi.fn(() => localStatus) };
    const button = {
      closest: vi.fn(() => localContainer),
      getAttribute: (name: string) => (name === "aria-describedby" ? "code-copy-status-1" : null),
    } as unknown as HTMLButtonElement;

    expect(findCodeCopyStatus(button)).toBe(localStatus);
    expect(button.closest).toHaveBeenCalledWith(".code-block");
    expect(localContainer.querySelector).toHaveBeenCalledWith("#code-copy-status-1");
  });

  it("finds nothing for a button without a described status", () => {
    const button = { getAttribute: () => null } as unknown as HTMLButtonElement;

    expect(findCodeCopyStatus(button)).toBeNull();
  });
});
