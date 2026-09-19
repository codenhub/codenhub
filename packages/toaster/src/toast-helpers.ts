import { animateOut, animateStackChange, getContainer } from "./dom";
import type { ToastPosition } from "./types";

export interface HideableToast {
  hide(): void;
  /**
   * Whether this owner must survive overflow eviction right now -- an
   * active loader, or a toast the user is currently hovering or has
   * focused. Checked on every eviction pass; never bypassed to force a
   * capacity or queue-pressure target.
   */
  readonly isProtected: boolean;
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

/**
 * Evicts the oldest eligible (unprotected, not already evicting) active
 * owners to relieve overflow pressure -- either a queue waiting for room or
 * a `maxVisible` lowered below current occupancy. A protected owner is
 * never evicted to reach either target: if every active owner is
 * protected, pressure simply persists and queued work keeps waiting.
 */
function evictForQueue(state: StackState): void {
  let neededSlots = Math.max(state.queue.length - state.evicting.size, state.active.length - state.maxVisible);
  if (neededSlots <= 0) {
    return;
  }

  const ownersToHide: HideableToast[] = [];
  for (const owner of state.active) {
    if (neededSlots <= 0) {
      break;
    }
    if (!state.evicting.has(owner) && !owner.isProtected) {
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

function promoteQueued(state: StackState): void {
  const availableCallbacks: Array<() => void> = [];
  while (state.active.length < state.maxVisible && state.queue.length > 0) {
    const request = state.queue.shift()!;
    if (!request.isCanceled) {
      state.active.push(request.owner);
      availableCallbacks.push(request.onAvailable);
    }
  }
  availableCallbacks.forEach((callback) => callback());
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

  promoteQueued(state);
  evictForQueue(state);

  if (state.active.length === 0 && state.queue.length === 0) {
    parentStates?.delete(key);
  }
}

export interface ReconcileCapacityParams {
  parent: HTMLElement;
  instanceId: string;
  maxVisible: number;
}

/**
 * Applies a runtime `maxVisible` change to every position stack this
 * instance already owns: promotes queued work into any newly-opened slots,
 * then evicts down to the new capacity among eligible (unprotected) active
 * owners. A limit lowered below the number of currently protected owners
 * is not enforced by evicting one of them -- the stack stays over capacity
 * until protection naturally releases, same as overflow admission.
 */
export function reconcileCapacity(params: ReconcileCapacityParams): void {
  const parentStates = stackStates.get(params.parent);
  if (!parentStates) {
    return;
  }
  const prefix = `${params.instanceId}:`;
  for (const [key, state] of parentStates) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    state.maxVisible = params.maxVisible;
    promoteQueued(state);
    evictForQueue(state);
  }
}
