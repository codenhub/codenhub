import { test } from "node:test";
import assert from "node:assert/strict";
import { quote } from "./orders.ts";

const customer = { id: "c1", region: "US" as const, previousOrders: 0 };

test("quote adds US tax and free shipping over 50", () => {
  const q = quote({ customer, items: [{ sku: "a", unitPrice: 30, quantity: 2 }] });
  assert.equal(q.subtotal, 60);
  assert.equal(q.shipping, 0);
  assert.equal(q.total, 64.2);
});

test("quote applies a known coupon", () => {
  const q = quote({ customer, items: [{ sku: "a", unitPrice: 100, quantity: 1 }], coupon: "SAVE10" });
  assert.equal(q.discount, 10);
});
