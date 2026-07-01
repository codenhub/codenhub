import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoist mock factories so they are available when vi.mock() runs.
// ---------------------------------------------------------------------------

const { mockWindowInstance, MockWindow } = vi.hoisted(() => {
  const mockWindowInstance = {
    label: "main",
    isMinimized: vi.fn().mockResolvedValue(false),
    isMaximized: vi.fn().mockResolvedValue(false),
    isFullscreen: vi.fn().mockResolvedValue(false),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    toggleMaximize: vi.fn(),
    setFullscreen: vi.fn(),
    setTitle: vi.fn(),
    setDecorations: vi.fn(),
    setResizable: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setSize: vi.fn(),
    setPosition: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    destroy: vi.fn(),
    once: vi.fn((_: string, cb: () => void) => {
      cb();
      return Promise.resolve(() => {});
    }),
  };

  const MockWindow = Object.assign(
    vi.fn().mockImplementation(function () {
      return mockWindowInstance;
    }),
    {
      getByLabel: vi.fn(),
    },
  );

  return { mockWindowInstance, MockWindow };
});

vi.mock("@tauri-apps/api/window", () => ({
  Window: MockWindow,
  getCurrentWindow: vi.fn().mockReturnValue(mockWindowInstance),
  getAllWindows: vi.fn().mockResolvedValue([]),
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

import { WindowState, createWindow, getCurrentWindowHandle, getWindow, listWindows } from "./index.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowInstance.once.mockImplementation((_: string, cb: () => void) => {
      cb();
      return Promise.resolve(() => {});
    });
  });

  it("should return a handle with the correct label", async () => {
    const handle = await createWindow({ label: "main" });
    expect(handle.label).toBe("main");
  });

  it("should throw error if window creation emits tauri://error", async () => {
    mockWindowInstance.once.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === "tauri://error") {
        cb("Creation failed");
      }
      return Promise.resolve(() => {});
    });

    await expect(
      createWindow({
        label: "main",
      }),
    ).rejects.toThrow('Failed to create window: "Creation failed"');
  });

  it("should throw error if window creation times out", async () => {
    vi.useFakeTimers();

    mockWindowInstance.once.mockImplementation(() => {
      return Promise.resolve(() => {});
    });

    const spawnPromise = createWindow({
      label: "main",
    });

    await Promise.all([
      expect(spawnPromise).rejects.toThrow('Timeout spawning window with label "main"'),
      vi.advanceTimersByTimeAsync(5000),
    ]);

    vi.useRealTimers();
  });

  it("should minimize the window", async () => {
    mockWindowInstance.minimize.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.minimize();
    expect(mockWindowInstance.minimize).toHaveBeenCalled();
  });

  it("should maximize the window", async () => {
    mockWindowInstance.maximize.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.maximize();
    expect(mockWindowInstance.maximize).toHaveBeenCalled();
  });

  it("should unmaximize the window", async () => {
    mockWindowInstance.unmaximize.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.unmaximize();
    expect(mockWindowInstance.unmaximize).toHaveBeenCalled();
  });

  it("should toggle maximize", async () => {
    mockWindowInstance.toggleMaximize.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.toggleMaximize();
    expect(mockWindowInstance.toggleMaximize).toHaveBeenCalled();
  });

  it("should enable fullscreen", async () => {
    mockWindowInstance.setFullscreen.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.fullscreen(true);
    expect(mockWindowInstance.setFullscreen).toHaveBeenCalledWith(true);
  });

  it("should set the window title", async () => {
    mockWindowInstance.setTitle.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.setTitle("My App");
    expect(mockWindowInstance.setTitle).toHaveBeenCalledWith("My App");
  });

  it("should enable decorations", async () => {
    mockWindowInstance.setDecorations.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.setDecorations(true);
    expect(mockWindowInstance.setDecorations).toHaveBeenCalledWith(true);
  });

  it("should show the window when setVisible is called with true", async () => {
    mockWindowInstance.show.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.setVisible(true);
    expect(mockWindowInstance.show).toHaveBeenCalled();
  });

  it("should hide the window when setVisible is called with false", async () => {
    mockWindowInstance.hide.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.setVisible(false);
    expect(mockWindowInstance.hide).toHaveBeenCalled();
  });

  it("should call close on close()", async () => {
    mockWindowInstance.close.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.close();
    expect(mockWindowInstance.close).toHaveBeenCalled();
  });

  it("should call destroy on destroy()", async () => {
    mockWindowInstance.destroy.mockResolvedValue(undefined);
    const handle = await createWindow({ label: "main" });
    await handle.destroy();
    expect(mockWindowInstance.destroy).toHaveBeenCalled();
  });
});

describe("getState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWindowInstance.once.mockImplementation((_: string, cb: () => void) => {
      cb();
      return Promise.resolve(() => {});
    });
  });

  it("should return NORMAL when window is in default state", async () => {
    mockWindowInstance.isMinimized.mockResolvedValue(false);
    mockWindowInstance.isMaximized.mockResolvedValue(false);
    mockWindowInstance.isFullscreen.mockResolvedValue(false);
    const handle = await createWindow({ label: "main" });
    expect(await handle.getState()).toBe(WindowState.NORMAL);
  });

  it("should return MINIMIZED when window is minimized", async () => {
    mockWindowInstance.isMinimized.mockResolvedValue(true);
    mockWindowInstance.isMaximized.mockResolvedValue(false);
    mockWindowInstance.isFullscreen.mockResolvedValue(false);
    const handle = await createWindow({ label: "main" });
    expect(await handle.getState()).toBe(WindowState.MINIMIZED);
  });

  it("should return MAXIMIZED when window is maximized", async () => {
    mockWindowInstance.isMinimized.mockResolvedValue(false);
    mockWindowInstance.isMaximized.mockResolvedValue(true);
    mockWindowInstance.isFullscreen.mockResolvedValue(false);
    const handle = await createWindow({ label: "main" });
    expect(await handle.getState()).toBe(WindowState.MAXIMIZED);
  });

  it("should return FULLSCREEN when window is fullscreen", async () => {
    mockWindowInstance.isMinimized.mockResolvedValue(false);
    mockWindowInstance.isMaximized.mockResolvedValue(false);
    mockWindowInstance.isFullscreen.mockResolvedValue(true);
    const handle = await createWindow({ label: "main" });
    expect(await handle.getState()).toBe(WindowState.FULLSCREEN);
  });

  it("should prioritize FULLSCREEN over MAXIMIZED when both are true", async () => {
    // Some platforms report both simultaneously during state transitions.
    mockWindowInstance.isMaximized.mockResolvedValue(true);
    mockWindowInstance.isFullscreen.mockResolvedValue(true);
    mockWindowInstance.isMinimized.mockResolvedValue(false);
    const handle = await createWindow({ label: "main" });
    expect(await handle.getState()).toBe(WindowState.FULLSCREEN);
  });
});

describe("getWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return undefined when label does not exist", async () => {
    MockWindow.getByLabel.mockResolvedValue(null);
    expect(await getWindow("nonexistent")).toBeUndefined();
  });

  it("should return a handle when label exists", async () => {
    MockWindow.getByLabel.mockResolvedValue(mockWindowInstance);
    const result = await getWindow("main");
    expect(result).toBeDefined();
    expect(result?.label).toBe("main");
  });
});

describe("getCurrentWindowHandle", () => {
  it("should return a handle with label from getCurrentWindow", () => {
    const handle = getCurrentWindowHandle();
    expect(handle.label).toBe("main");
  });
});

describe("listWindows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return an empty array when no windows exist", async () => {
    const { getAllWindows } = await import("@tauri-apps/api/window");
    vi.mocked(getAllWindows).mockResolvedValue([]);
    expect(await listWindows()).toEqual([]);
  });

  it("should return handles for all open windows", async () => {
    const { getAllWindows } = await import("@tauri-apps/api/window");
    vi.mocked(getAllWindows).mockResolvedValue([
      { ...mockWindowInstance, label: "win-a" },
      { ...mockWindowInstance, label: "win-b" },
    ] as never);
    const handles = await listWindows();
    expect(handles).toHaveLength(2);
    expect(handles[0]?.label).toBe("win-a");
    expect(handles[1]?.label).toBe("win-b");
  });
});
