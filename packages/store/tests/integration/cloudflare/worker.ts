import type { DurableObjectState, KVNamespace, DurableObjectNamespace } from "@cloudflare/workers-types";

import { cloudflareDoDriver, cloudflareKvDriver } from "../../../dist/cloudflare.js";
import { createAsyncStore } from "../../../dist/index.js";

interface Env {
  RECORDS: KVNamespace;
  STORES: DurableObjectNamespace;
}

const initialState = { theme: "light", count: 0 };

export class StoreObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(): Promise<Response> {
    // Pass the real binding directly: delete resolves to boolean, not void.
    const create = () =>
      createAsyncStore({
        storageKey: "settings",
        initialState,
        driver: cloudflareDoDriver<typeof initialState>({ storage: this.state.storage }),
      });
    const store = create();
    const empty = await store.get();
    const saved = await store.set({ theme: "dark", count: 1 });
    await store.patch({ count: 2 });
    const persisted = await create().get();
    await store.clear();
    return Response.json({
      empty,
      saved,
      persisted,
      cleared: await create().get(),
      raw: (await this.state.storage.get("settings")) ?? null,
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/do") {
      const object = env.STORES.get(env.STORES.idFromName("settings"));
      // The workers-types Response uses the worker runtime's WebSocket extensions.
      const response = await object.fetch("http://object.test/");
      return new Response(await response.text(), { status: response.status });
    }
    const create = () =>
      createAsyncStore({
        storageKey: "settings",
        initialState,
        driver: cloudflareKvDriver<typeof initialState>({ kvNamespace: env.RECORDS }),
      });
    const store = create();
    const empty = await store.get();
    const saved = await store.set({ theme: "dark", count: 1 });
    await store.patch({ count: 2 });
    const persisted = await create().get();
    await store.clear();
    return Response.json({
      empty,
      saved,
      persisted,
      cleared: await create().get(),
      raw: await env.RECORDS.get("settings"),
    });
  },
};
