import { test } from "node:test";
import assert from "node:assert/strict";
import { add, edit } from "./contacts.ts";

test("add assigns the next id", () => {
  const contacts = [{ id: 7, name: "A", phone: "1", email: "a@example.com" }];
  assert.equal(add(contacts, { name: "B", phone: "2", email: "b@example.com" }).id, 8);
});

test("edit changes one field", () => {
  const contacts = [{ id: 1, name: "A", phone: "1", email: "a@example.com" }];
  assert.equal(edit(contacts, 1, "email", "x@example.com").email, "x@example.com");
});
