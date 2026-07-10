import { animateOut, animateStackChange, getContainer } from "./dom";
import type { ToastPosition } from "./types";

export interface HideableToast {
  hide(): void;
}

interface SlotRequest {
  readonly owner: HideableToast;
  readonly onAvailable: () => void;
  isCanceled: boolean;
}

interface StackState {
  readonly active: HideableToast[];
  readonly evicting: Set<HideableToast>;
  readonly queue: SlotRequest[];
  maxVisible: number;
}

const stackStates = new WeakMap<HTMLElement, Map<string, StackState>>();

export const dismissingElements = new WeakSet<HTMLDivElement>();
export const toastByElement = new WeakMap<HTMLDivElement, HideableToast>();

export interface RemoveToastElementParams {
  element: HTMLDivElement;
  parent: HTMLElement;
  position: ToastPosition;
  instanceId: string;
  onComplete: () => void;
}

export function removeToastElement(params: RemoveToastElementParams): void {
  const { element, parent, position, instanceId, onComplete } = params;
  const container = getContainer({ parent, position, instanceId });
  if (!container || !container.contains(element)) {
    onComplete();
    return;
  }
  if (dismissingElements.has(element)) {
    return;
  }
  dismissingElements.add(element);

  animateOut({
    element,
    position,
    onComplete: () => {
      dismissingElements.delete(element);
      animateStackChange(container, () => element.remove());
      onComplete();
    },
  });
}

export interface RequestSlotParams {
  parent: HTMLElement;
  position: ToastPosition;
  instanceId: string;
  maxVisible: number;
  owner: HideableToast;
  onAvailable: () => void;
}

function getStackKey(instanceId: string, position: ToastPosition): string {
  return `${instanceId}:${position}`;
}

function getStackState(params: RequestSlotParams): StackState {
  let parentStates = stackStates.get(params.parent);
  if (!parentStates) {
    parentStates = new Map();
    stackStates.set(params.parent, parentStates);
  }
  const key = getStackKey(params.instanceId, params.position);
  let state = parentStates.get(key);
  if (!state) {
    state = { active: [], evicting: new Set(), queue: [], maxVisible: params.maxVisible };
    parentStates.set(key, state);
  }
  state.maxVisible = params.maxVisible;
  return state;
}

function evictForQueue(state: StackState): void {
  let neededSlots = state.queue.length - state.evicting.size;
  if (neededSlots <= 0) {
    return;
  }

  const ownersToHide: HideableToast[] = [];
  for (const owner of state.active) {
    if (neededSlots <= 0) {
      break;
    }
    if (!state.evicting.has(owner)) {
      state.evicting.add(owner);
      ownersToHide.push(owner);
      neededSlots -= 1;
    }
  }
  ownersToHide.forEach((owner) => owner.hide());
}

export function requestSlot(params: RequestSlotParams): (() => void) | null {
  const state = getStackState(params);
  if (state.queue.length === 0 && state.active.length < state.maxVisible) {
    state.active.push(params.owner);
    return null;
  }

  const request: SlotRequest = { owner: params.owner, onAvailable: params.onAvailable, isCanceled: false };
  state.queue.push(request);
  evictForQueue(state);

  return () => {
    if (request.isCanceled) {
      return;
    }
    request.isCanceled = true;
    const index = state.queue.indexOf(request);
    if (index >= 0) {
      state.queue.splice(index, 1);
    }
  };
}

export function releaseSlot(params: Omit<RequestSlotParams, "onAvailable" | "maxVisible">): void {
  const parentStates = stackStates.get(params.parent);
  const key = getStackKey(params.instanceId, params.position);
  const state = parentStates?.get(key);
  if (!state) {
    return;
  }

  const activeIndex = state.active.indexOf(params.owner);
  if (activeIndex >= 0) {
    state.active.splice(activeIndex, 1);
  }
  state.evicting.delete(params.owner);

  const availableCallbacks: Array<() => void> = [];
  while (state.active.length < state.maxVisible && state.queue.length > 0) {
    const request = state.queue.shift()!;
    if (!request.isCanceled) {
      state.active.push(request.owner);
      availableCallbacks.push(request.onAvailable);
    }
  }
  availableCallbacks.forEach((callback) => callback());
  evictForQueue(state);

  if (state.active.length === 0 && state.queue.length === 0) {
    parentStates?.delete(key);
  }
}
