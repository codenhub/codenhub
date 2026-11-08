import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createToaster } from "./core";
import { createDialogs } from "./dialogs";
import { animations, flushAnimations, installAnimateMock, installDialogMocks } from "./test-utils";

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((element) => element.remove());
  installAnimateMock();
  installDialogMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("configuration boundaries", () => {
  it.each([
    { duration: Number.NaN },
    { duration: Number.POSITIVE_INFINITY },
    { duration: -1 },
    { maxVisible: 0 },
    { maxVisible: 1.5 },
  ])("should reject invalid global configuration $duration $maxVisible", (config) => {
    expect(() => createToaster(config)).toThrow(/duration|maxVisible/);
  });

  it("should reject changing the container after construction", () => {
    const toaster = createToaster();
    const container = document.createElement("section");

    // @ts-expect-error Runtime guard protects JavaScript consumers too.
    expect(() => toaster.configure({ container })).toThrow(/container/);
    toaster.destroy();
  });

  it("should own a snapshot of construction configuration", () => {
    const originalContainer = document.createElement("section");
    const replacementContainer = document.createElement("section");
    document.body.append(originalContainer, replacementContainer);
    const config = { container: originalContainer };
    const toaster = createToaster(config);

    config.container = replacementContainer;
    toaster.success("Owned config");

    expect(originalContainer.textContent).toContain("Owned config");
    expect(replacementContainer.textContent).not.toContain("Owned config");
    toaster.destroy();
  });

  it("should reject invalid nested defaults during configuration", () => {
    expect(() => createToaster({ semantic: { duration: -1 } })).toThrow(/duration/);
    const toaster = createToaster();
    expect(() => toaster.configure({ custom: { duration: Number.NaN } })).toThrow(/duration/);
    toaster.destroy();
  });

  it("should reject invalid runtime enum values", () => {
    expect(() => createToaster({ position: "sideways" as never })).toThrow(/position/);
    const toaster = createToaster();
    expect(() => toaster.success("Invalid", { role: "log" as never })).toThrow(/role/);
    expect(() => toaster("Invalid", { type: "critical" as never })).toThrow(/type/);
    toaster.destroy();
  });
});

describe("toast lifecycle", () => {
  it("should notify late subscribers when a lifecycle phase already happened", () => {
    const toaster = createToaster();
    const handle = toaster.success("Saved");
    const onShow = vi.fn();

    handle.onShow(onShow);

    expect(onShow).toHaveBeenCalledOnce();
    expect(onShow).toHaveBeenCalledWith(handle);
    toaster.destroy();
  });

  it("should pass public ToastHandle to lifecycle subscribers", async () => {
    const toaster = createToaster();
    const onShow = vi.fn();
    const onShown = vi.fn();
    const onHide = vi.fn();
    const onHidden = vi.fn();

    const handle = toaster.success("Info");
    handle.onShow(onShow);
    handle.onShown(onShown);
    handle.onHide(onHide);
    handle.onHidden(onHidden);

    expect(onShow).toHaveBeenCalledWith(handle);

    flushAnimations();
    expect(onShown).toHaveBeenCalledWith(handle);

    handle.dismiss();
    expect(onHide).toHaveBeenCalledWith(handle);

    flushAnimations();
    await handle.settled;
    expect(onHidden).toHaveBeenCalledWith(handle);

    toaster.destroy();
  });

  it("should finish hiding when a lifecycle subscriber throws", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const toaster = createToaster();
    const handle = toaster.success("Saved");
    handle.onHide(() => {
      throw new Error("consumer callback failed");
    });

    handle.dismiss();
    flushAnimations();

    await expect(handle.settled).resolves.toBeUndefined();
    expect(handle.state).toBe("hidden");
    expect(reportError).toHaveBeenCalledOnce();
    toaster.destroy();
  });

  it("should expose queued state and preserve FIFO admission", () => {
    const toaster = createToaster({ maxVisible: 1, autoDismiss: false });
    const first = toaster.info("First");
    const second = toaster.info("Second");
    const third = toaster.info("Third");

    expect(first.state).toBe("hiding");
    expect(second.state).toBe("queued");
    expect(third.state).toBe("queued");
    expect(document.body.textContent).not.toContain("Third");

    flushAnimations();
    expect(second.state).toBe("hiding");
    expect(third.state).toBe("queued");

    flushAnimations();
    expect(third.state).toBe("visible");
    toaster.destroy();
  });

  it("should complete terminal lifecycle when a queued toast is dismissed", async () => {
    const toaster = createToaster({ maxVisible: 1, autoDismiss: false });
    toaster.info("First");
    const queued = toaster.info("Queued");
    const onHidden = vi.fn();

    queued.dismiss();
    queued.onHidden(onHidden);

    await expect(queued.settled).resolves.toBeUndefined();
    expect(queued.state).toBe("hidden");
    expect(onHidden).toHaveBeenCalledOnce();
    toaster.destroy();
  });

  it("should resume auto-dismiss using remaining duration", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 2000 });
    const handle = toaster.success("Timed");
    flushAnimations();
    const element = document.body.querySelector(".toaster-toast")!;

    vi.advanceTimersByTime(1000);
    element.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(5000);
    element.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(1000);
    flushAnimations();

    expect(handle.state).toBe("hidden");
    toaster.destroy();
  });

  it("should not start auto-dismiss before entrance completes", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 2000 });
    const handle = toaster.success("Entering");
    const element = document.body.querySelector(".toaster-toast")!;

    element.dispatchEvent(new MouseEvent("mouseenter"));
    element.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(1000);
    flushAnimations();
    vi.advanceTimersByTime(1000);

    expect(handle.state).toBe("visible");
    vi.advanceTimersByTime(1000);
    flushAnimations();
    expect(handle.state).toBe("hidden");
    toaster.destroy();
  });
});

describe("content security", () => {
  it("should render an HTML-looking string as text instead of a link", () => {
    const toaster = createToaster();
    const markup = '<a style="position:fixed" target="_BLANK" href="https://example.com">Open</a>';
    toaster.custom(markup);

    expect(document.body.querySelector("a")).toBeNull();
    expect(document.body.textContent).toContain(markup);
    toaster.destroy();
  });

  it("should reject whitespace-only string content, rather than rendering a blank toast", () => {
    const toaster = createToaster({ maxVisible: 1, autoDismiss: false });

    expect(() => toaster.custom("   ")).toThrow(/empty/);
    expect(() => toaster.success("Still available")).not.toThrow();
    expect(document.body.textContent).toContain("Still available");
    toaster.destroy();
  });

  it("should support containers whose IDs contain selector metacharacters", () => {
    const container = document.createElement("section");
    container.id = 'quoted"id';
    document.body.appendChild(container);
    const toaster = createToaster({ container });

    expect(() => toaster.success("Safe selector")).not.toThrow();
    toaster.destroy();
  });

  it("should use the configured container document across realms", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const iframeDocument = iframe.contentDocument!;
    const container = iframeDocument.createElement("main");
    iframeDocument.body.appendChild(container);
    const content = iframeDocument.createElement("span");
    content.textContent = "Cross realm";
    const toaster = createToaster({ container, margin: "8px" });

    toaster.custom(content);
    toaster.configure({ margin: "24px" });
    const stack = container.querySelector<HTMLElement>("[data-toast-container]")!;

    expect(stack.textContent).toContain("Cross realm");
    expect(stack.style.getPropertyValue("--toast-margin-x")).toBe("24px");
    toaster.destroy();
  });

  it("should reject unsupported node types before reserving a stack slot", () => {
    const toaster = createToaster({ maxVisible: 1, autoDismiss: false });

    expect(() => toaster.custom(document as never)).toThrow(/Node/);
    expect(() => toaster.success("Still available")).not.toThrow();
    expect(document.body.textContent).toContain("Still available");
    toaster.destroy();
  });
});

describe("interactive dialogs", () => {
  it("should expose an honest interactive handle", () => {
    const dialogs = createDialogs();
    const handle = dialogs.confirm("Continue?");

    expect(handle.state).toBe("visible");
    expect(Object.keys(handle).sort()).toEqual(["catch", "dismiss", "finally", "result", "settled", "state", "then"]);
    handle.dismiss();
    dialogs.destroy();
  });

  it("should associate dialog text and prompt labels", () => {
    const dialogs = createDialogs();
    const handle = dialogs.prompt("Project name", { title: "Create project" });
    const dialog = document.body.querySelector("dialog")!;
    const input = dialog.querySelector("input")!;

    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(input.getAttribute("aria-labelledby")).toBeTruthy();
    handle.dismiss();
    dialogs.destroy();
  });

  it("should reject a failed modal and continue its queue", async () => {
    const showModal = vi
      .spyOn(HTMLDialogElement.prototype, "showModal")
      .mockImplementationOnce(() => {
        throw new DOMException("Detached", "InvalidStateError");
      })
      .mockImplementation(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      });
    const dialogs = createDialogs();
    const failed = dialogs.confirm("First");
    const next = dialogs.confirm("Second");

    await expect(failed.result).rejects.toThrow("Detached");
    expect(showModal).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("Second");
    next.dismiss();
    dialogs.destroy();
  });

  it("should ignore Enter while prompt input is composing", () => {
    const dialogs = createDialogs();
    const handle = dialogs.prompt("Name");
    const input = document.body.querySelector("input")!;

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));

    expect(handle.state).toBe("visible");
    handle.dismiss();
    dialogs.destroy();
  });

  it("should restore the original focus after a queued dialog sequence", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const dialogs = createDialogs();
    const first = dialogs.alert("First");
    const second = dialogs.alert("Second");

    first.dismiss();
    await first.settled;
    second.dismiss();
    await second.settled;

    expect(document.activeElement).toBe(opener);
    dialogs.destroy();
  });
});

describe("explicit undefined options", () => {
  it("keeps per-variant defaults when a per-call option is undefined", () => {
    const toaster = createToaster({ semantic: { position: "bottom-left" }, custom: { position: "top-left" } });
    toaster.success("Saved", { position: undefined });
    toaster.custom("<b>Hi</b>", { position: undefined });

    expect(document.body.querySelector(".toaster-toast-stack-bottom-left .toaster-toast")).not.toBeNull();
    expect(document.body.querySelector(".toaster-toast-stack-top-left .toaster-toast")).not.toBeNull();
    expect(document.body.querySelector(".toaster-toast-stack-top-right")).toBeNull();
    toaster.destroy();
  });

  it("keeps a promise call's position when its loading options set position to undefined", () => {
    const toaster = createToaster();
    void toaster.promise(new Promise(() => {}), {
      position: "top-left",
      loading: { message: "Saving", position: undefined },
      success: "Saved",
      error: "Failed",
    });

    expect(document.body.querySelector(".toaster-toast-stack-top-left .toaster-toast")).not.toBeNull();
    expect(document.body.querySelector(".toaster-toast-stack-top-right")).toBeNull();
    toaster.destroy();
  });

  it("keeps instance dialog labels when a per-call label is undefined", async () => {
    const dialogs = createDialogs({ labels: { confirm: "Confirmar", cancel: "Cancelar", submit: "Enviar", ok: "Ok" } });

    const confirm = dialogs.confirm("Sure?", { confirmLabel: undefined, cancelLabel: undefined });
    expect(document.body.querySelector(".toast-dialog-btn-primary")?.textContent).toBe("Confirmar");
    expect(document.body.querySelector(".toast-dialog-btn-cancel")?.textContent).toBe("Cancelar");
    confirm.dismiss();
    await confirm.settled;

    const prompt = dialogs.prompt("Name?", { submitLabel: undefined });
    expect(document.body.querySelector(".toast-dialog-btn-primary")?.textContent).toBe("Enviar");
    prompt.dismiss();
    await prompt.settled;

    const alert = dialogs.alert("Done", { okLabel: undefined });
    expect(document.body.querySelector(".toast-dialog-btn-primary")?.textContent).toBe("Ok");
    alert.dismiss();
    await alert.settled;
    dialogs.destroy();
  });
});

describe("promise outcome defaults", () => {
  it("applies the semantic defaults to the outcome toast", async () => {
    vi.useFakeTimers();
    const toaster = createToaster({ semantic: { duration: 10000, dismissible: true } });
    await toaster.promise(Promise.resolve(1), { loading: "Saving", success: "Saved", error: "Failed" });
    flushAnimations();
    const element = document.body.querySelector(".toaster-toast")!;
    expect(element.querySelector(".toaster-toast-dismiss")).not.toBeNull();

    vi.advanceTimersByTime(5000);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")).not.toBeNull();

    vi.advanceTimersByTime(5100);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")).toBeNull();
    toaster.destroy();
  });

  it("lets the outcome's own autoDismiss keep it open", async () => {
    vi.useFakeTimers();
    const toaster = createToaster();
    await toaster.promise(Promise.resolve(1), {
      loading: "Saving",
      success: { message: "Saved", autoDismiss: false },
      error: "Failed",
    });
    flushAnimations();
    vi.advanceTimersByTime(20000);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")).not.toBeNull();
    toaster.destroy();
  });

  it("falls back to the instance-wide autoDismiss", async () => {
    vi.useFakeTimers();
    const toaster = createToaster({ autoDismiss: false });
    await toaster.promise(Promise.resolve(1), { loading: "Saving", success: "Saved", error: "Failed" });
    flushAnimations();
    vi.advanceTimersByTime(20000);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")?.textContent).toContain("Saved");
    expect(document.body.querySelector(".toaster-toast-spinner")).toBeNull();
    toaster.destroy();
  });

  it("falls back to the instance-wide autoDismiss for a rejected promise", async () => {
    vi.useFakeTimers();
    const toaster = createToaster({ autoDismiss: false });
    await expect(
      toaster.promise(Promise.reject(new Error("nope")), { loading: "Saving", success: "Saved", error: "Failed" }),
    ).rejects.toThrow("nope");
    flushAnimations();
    vi.advanceTimersByTime(20000);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")?.textContent).toContain("Failed");
    expect(document.body.querySelector(".toaster-toast-spinner")).toBeNull();
    toaster.destroy();
  });

  it("lets semantic.autoDismiss beat the instance-wide autoDismiss", async () => {
    vi.useFakeTimers();
    const toaster = createToaster({ autoDismiss: false, semantic: { autoDismiss: true } });
    await toaster.promise(Promise.resolve(1), { loading: "Saving", success: "Saved", error: "Failed" });
    flushAnimations();
    vi.advanceTimersByTime(5100);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")).toBeNull();
    toaster.destroy();
  });
});

describe("custom content updates", () => {
  it("does not insert an icon into custom content when its type changes", () => {
    const toaster = createToaster();
    const handle = toaster.custom("<b>Hi</b>");
    flushAnimations();

    handle.update({ type: "success" });
    const element = document.body.querySelector(".toaster-toast")!;
    expect(element.querySelector(".toaster-toast-icon")).toBeNull();
    expect(element.classList.contains("toaster-toast-success")).toBe(true);

    handle.update({ icon: "info" });
    expect(element.querySelector(".toaster-toast-icon")).toBeNull();
    toaster.destroy();
  });
});

describe("toast layers under queued dialogs", () => {
  it("keeps toasts inside the open dialog when a queued dialog is dismissed", () => {
    const toaster = createToaster();
    const dialogs = createDialogs();
    void dialogs.confirm("Discard?");
    const queued = dialogs.alert("Later");
    const dialog = document.querySelector("dialog")!;

    queued.dismiss();
    toaster.error("Save failed", { autoDismiss: false });
    flushAnimations();

    expect(document.querySelector(".toaster-toast")!.closest("dialog")).toBe(dialog);
    dialogs.destroy();
    toaster.destroy();
  });
});

describe("focus across updates", () => {
  it("keeps focus on the action button when a message update arrives", () => {
    const toaster = createToaster();
    const handle = toaster("Uploading 1%", { autoDismiss: false, action: { label: "Cancel", onClick: () => {} } });
    flushAnimations();
    const action = document.querySelector<HTMLButtonElement>("[data-toast-action]")!;
    action.focus();

    handle.update({ message: "Uploading 42%" });

    expect(document.activeElement).toBe(action);
    expect(document.querySelector("[data-toast-message]")!.textContent).toBe("Uploading 42%");
    toaster.destroy();
  });

  it("moves focus to the new action button when the action itself changes", () => {
    const toaster = createToaster();
    const handle = toaster("Uploading", { autoDismiss: false, action: { label: "Cancel", onClick: () => {} } });
    flushAnimations();
    document.querySelector<HTMLButtonElement>("[data-toast-action]")!.focus();

    handle.update({ action: { label: "Retry", onClick: () => {} } });

    const action = document.querySelector<HTMLButtonElement>("[data-toast-action]")!;
    expect(action.textContent).toBe("Retry");
    expect(document.activeElement).toBe(action);
    toaster.destroy();
  });

  it("does not take back focus that moved elsewhere during the exit animation", () => {
    const trigger = document.createElement("button");
    const editor = document.createElement("input");
    document.body.append(trigger, editor);
    trigger.focus();
    const toaster = createToaster();
    toaster("Deleted", { autoDismiss: false, dismissible: true });
    flushAnimations();
    document.querySelector<HTMLButtonElement>(".toaster-toast-dismiss")!.focus();

    document.querySelector<HTMLButtonElement>(".toaster-toast-dismiss")!.click();
    editor.focus();
    flushAnimations();

    expect(document.activeElement).toBe(editor);
    toaster.destroy();
  });
});

describe("prompt submission", () => {
  it("prevents the default action of the Enter key that submits it", () => {
    const dialogs = createDialogs();
    void dialogs.prompt("Name?");
    const input = document.querySelector<HTMLInputElement>("dialog input")!;

    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    dialogs.destroy();
  });
});

describe("updates from an onShow subscriber", () => {
  it("renders a queued toast's content once when onShow updates it", () => {
    const toaster = createToaster({ maxVisible: 1 });
    const first = toaster("First", { autoDismiss: false });
    flushAnimations();
    const queued = toaster("Second", { autoDismiss: false, dismissible: true });
    queued.onShow((handle) => handle.update({ description: "More detail" }));

    first.dismiss();
    flushAnimations();

    const toasts = Array.from(document.querySelectorAll(".toaster-toast"));
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.querySelectorAll("[data-toast-main]")).toHaveLength(1);
    expect(toasts[0]!.querySelectorAll(".toaster-toast-dismiss")).toHaveLength(1);
    expect(toasts[0]!.querySelector("[data-toast-description]")!.textContent).toBe("More detail");
    toaster.destroy();
  });
});

describe("dialogs after the page changes", () => {
  it("opens a dialog again after the body it was attached to is replaced", async () => {
    const dialogs = createDialogs();
    const first = dialogs.alert("One");
    first.dismiss();
    await first.settled;

    document.body.replaceWith(document.createElement("body"));
    const second = dialogs.alert("Two");

    const dialog = document.querySelector("dialog")!;
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.open).toBe(true);
    second.dismiss();
    dialogs.destroy();
  });

  it("opens a dialog again after its element was removed", async () => {
    const dialogs = createDialogs();
    const first = dialogs.alert("One");
    first.dismiss();
    await first.settled;

    document.querySelector("dialog")!.remove();
    void dialogs.alert("Two");

    expect(document.querySelector("dialog")?.open).toBe(true);
    dialogs.destroy();
  });
});

describe("teardown after clear", () => {
  it("settles toasts that are still leaving when destroy follows clear", () => {
    const toaster = createToaster();
    const handle = toaster("Bye", { autoDismiss: false });
    flushAnimations();
    const onHidden = vi.fn();
    handle.onHidden(onHidden);

    toaster.clear();
    toaster.destroy();

    expect(handle.state).toBe("hidden");
    expect(onHidden).toHaveBeenCalledOnce();
  });

  it("cancels the exit animation of a toast dismissed during its entrance", () => {
    const toaster = createToaster();
    const handle = toaster("Quick", { autoDismiss: false });
    const entrance = animations[0]!;

    handle.dismiss();
    const exit = animations.at(-1)!;
    const cancel = vi.spyOn(exit, "cancel");
    entrance.onfinish?.();
    toaster.destroy();

    expect(cancel).toHaveBeenCalled();
  });
});

describe("leaving the loading state through update()", () => {
  it("keeps the instance-wide autoDismiss: false", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ autoDismiss: false });
    const handle = toaster.loading("Syncing");
    flushAnimations();
    handle.update({ type: "success", message: "Synced" });
    vi.advanceTimersByTime(20000);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")?.textContent).toContain("Synced");
    toaster.destroy();
  });

  it("takes semantic.duration for a semantic result", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ semantic: { duration: 10000 } });
    const handle = toaster.loading("Syncing");
    flushAnimations();
    handle.update({ type: "success", message: "Synced" });

    vi.advanceTimersByTime(5000);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")).not.toBeNull();

    vi.advanceTimersByTime(5100);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")).toBeNull();
    toaster.destroy();
  });

  it("takes the instance-wide timing for a default result, not semantic's", () => {
    vi.useFakeTimers();
    const toaster = createToaster({ duration: 2000, semantic: { duration: 10000 } });
    const handle = toaster.loading("Syncing");
    flushAnimations();
    handle.update({ icon: null, message: "Synced" });
    vi.advanceTimersByTime(2100);
    flushAnimations();
    expect(document.body.querySelector(".toaster-toast")).toBeNull();
    toaster.destroy();
  });
});

describe("promise outcome dismissible", () => {
  it("falls back to the instance-wide dismissible, not the loading one", async () => {
    const toaster = createToaster({ dismissible: true, loading: { dismissible: false } });
    const pending = toaster.promise(Promise.resolve(1), { loading: "Saving", success: "Saved", error: "Failed" });
    expect(document.body.querySelector(".toaster-toast-dismiss")).toBeNull();
    await pending;
    expect(document.body.querySelector(".toaster-toast-dismiss")).not.toBeNull();
    toaster.destroy();
  });
});

describe("configure() without a document", () => {
  it("stores the settings without throwing", () => {
    const originalDoc = globalThis.document;
    // @ts-expect-error simulating SSR
    delete globalThis.document;
    try {
      const toaster = createToaster();
      expect(() => toaster.configure({ labels: { notifications: "Avisos" } })).not.toThrow();
      expect(() => toaster.configure({ maxVisible: 2 })).not.toThrow();
      expect(() => toaster.configure({ margin: "24px" })).not.toThrow();
      toaster.destroy();
    } finally {
      globalThis.document = originalDoc;
    }
  });
});

describe("duration limit", () => {
  const tooLong = 2_147_483_648;

  it("rejects a toast duration a browser timer cannot hold", () => {
    const toaster = createToaster();
    expect(() => toaster("Hello", { duration: tooLong })).toThrow(
      "Toast duration must be a number from 0 to 2147483647.",
    );
    expect(() => toaster("Hello", { duration: 2_147_483_647 })).not.toThrow();
    toaster.destroy();
  });

  it("rejects it in update() and in the instance config", () => {
    const toaster = createToaster();
    const handle = toaster("Hello");
    expect(() => handle.update({ duration: tooLong })).toThrow(/from 0 to 2147483647/);
    expect(() => createToaster({ duration: tooLong })).toThrow(
      "Toaster duration must be a number from 0 to 2147483647.",
    );
    expect(() => createToaster({ semantic: { duration: tooLong } })).toThrow(
      "Toaster nested duration must be a number from 0 to 2147483647.",
    );
    toaster.destroy();
  });
});
