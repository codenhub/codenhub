import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock factories so they are available when vi.mock() runs.
// vi.mock() calls are hoisted to the top of the file by Vitest's transformer,
// so any variables they reference must also be hoisted.
// ---------------------------------------------------------------------------

const { mockWebviewInstance, MockWebviewWindow, mockInvoke } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockWebviewInstance = {
    label: "test-view",
    setSize: vi.fn(),
    setPosition: vi.fn(),
    setFocus: vi.fn(),
    setZoom: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    once: vi.fn((_: string, cb: () => void) => {
      cb();
      return Promise.resolve();
    }),
  };

  const MockWebviewWindow = Object.assign(
    vi.fn().mockImplementation(function () {
      return mockWebviewInstance;
    }),
    {
      getByLabel: vi.fn().mockResolvedValue(null),
      getCurrent: vi.fn().mockReturnValue(mockWebviewInstance),
      getAll: vi.fn().mockResolvedValue([]),
    },
  );

  return { mockWebviewInstance, MockWebviewWindow, mockInvoke };
});

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: MockWebviewWindow,
  getCurrentWebviewWindow: vi.fn().mockReturnValue(mockWebviewInstance),
  getAllWebviewWindows: vi.fn().mockResolvedValue([]),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  // eslint-disable-next-line object-shorthand
  LogicalPosition: vi.fn().mockImplementation(function (this: { x: number; y: number }, x: number, y: number) {
    this.x = x;
    this.y = y;
  }),
  // eslint-disable-next-line object-shorthand
  LogicalSize: vi.fn().mockImplementation(function (
    this: { width: number; height: number },
    width: number,
    height: number,
  ) {
    this.width = width;
    this.height = height;
  }),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks are registered)
// ---------------------------------------------------------------------------

import { getCurrentWebview, getWebview, listWebviews, spawnWebview } from "./index.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("spawnWebview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebviewInstance.once.mockImplementation((_: string, cb: () => void) => {
      cb();
      return Promise.resolve();
    });
  });

  it("should return a handle with the correct label", async () => {
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    expect(handle.label).toBe("test-view");
  });

  it("should resize via setSize", async () => {
    mockWebviewInstance.setSize.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.setSize({ width: 800, height: 600 });
    expect(mockWebviewInstance.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 800, height: 600 }));
  });

  it("should reposition via setPosition", async () => {
    mockWebviewInstance.setPosition.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.setPosition({ x: 10, y: 20 });
    expect(mockWebviewInstance.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 10, y: 20 }));
  });

  it("should call setFocus on the underlying webview", async () => {
    mockWebviewInstance.setFocus.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.setFocus();
    expect(mockWebviewInstance.setFocus).toHaveBeenCalled();
  });

  it("should set zoom level", async () => {
    mockWebviewInstance.setZoom.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.setZoom(1.5);
    expect(mockWebviewInstance.setZoom).toHaveBeenCalledWith(1.5);
  });

  it("should show the webview", async () => {
    mockWebviewInstance.show.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.show();
    expect(mockWebviewInstance.show).toHaveBeenCalled();
  });

  it("should hide the webview", async () => {
    mockWebviewInstance.hide.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.hide();
    expect(mockWebviewInstance.hide).toHaveBeenCalled();
  });

  it("should destroy the webview on destroy()", async () => {
    mockWebviewInstance.destroy.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.destroy();
    expect(mockWebviewInstance.destroy).toHaveBeenCalled();
  });

  it("should navigate via navigate", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.navigate("https://b.com");
    expect(mockInvoke).toHaveBeenCalledWith("navigate_webview", {
      label: "test-view",
      url: "https://b.com",
    });
  });

  it("should reload via reload", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const handle = await spawnWebview({
      label: "test-view",
      url: "https://a.com",
    });
    await handle.reload();
    expect(mockInvoke).toHaveBeenCalledWith("reload_webview", {
      label: "test-view",
    });
  });

  it("should throw error if duplicate label exists", async () => {
    MockWebviewWindow.getByLabel.mockResolvedValue(mockWebviewInstance);
    await expect(
      spawnWebview({
        label: "test-view",
        url: "https://a.com",
      }),
    ).rejects.toThrow('WebView window with label "test-view" already exists');
  });
});

describe("getWebview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return undefined when label does not exist", async () => {
    MockWebviewWindow.getByLabel.mockResolvedValue(null);
    expect(await getWebview("nonexistent")).toBeUndefined();
  });

  it("should return a handle when label exists", async () => {
    MockWebviewWindow.getByLabel.mockResolvedValue(mockWebviewInstance);
    const result = await getWebview("test-view");
    expect(result).toBeDefined();
    expect(result?.label).toBe("test-view");
  });
});

describe("getCurrentWebview", () => {
  it("should return a handle with label from getCurrentWebviewWindow", () => {
    const handle = getCurrentWebview();
    expect(handle.label).toBe("test-view");
  });
});

describe("listWebviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return an empty array when no webviews exist", async () => {
    const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    vi.mocked(getAllWebviewWindows).mockResolvedValue([]);
    expect(await listWebviews()).toEqual([]);
  });

  it("should return handles for all active webviews", async () => {
    const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    vi.mocked(getAllWebviewWindows).mockResolvedValue([
      { ...mockWebviewInstance, label: "view-a" },
      { ...mockWebviewInstance, label: "view-b" },
    ] as never);
    const handles = await listWebviews();
    expect(handles).toHaveLength(2);
    expect(handles[0]?.label).toBe("view-a");
    expect(handles[1]?.label).toBe("view-b");
  });
});
