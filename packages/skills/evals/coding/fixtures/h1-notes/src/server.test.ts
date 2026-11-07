import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "./server.ts";
import { createMemoryStore } from "./store.ts";

const note = { id: "n1", ownerId: "u1", title: "Groceries", body: "milk", pinned: false, updatedAt: "2026-11-01T10:00:00.000Z" };

test("GET returns the owner's note", async (t) => {
  const server = createApp(createMemoryStore([note])).listen(0);
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/notes/n1`, { headers: { "x-user-id": "u1" } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), note);
});
