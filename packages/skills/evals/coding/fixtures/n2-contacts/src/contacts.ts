import { readFile, writeFile } from "node:fs/promises";

export interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
}

export async function load(file: string): Promise<Contact[]> {
  return JSON.parse(await readFile(file, "utf8")) as Contact[];
}

export async function save(file: string, contacts: Contact[]): Promise<void> {
  await writeFile(file, JSON.stringify(contacts, null, 2) + "\n");
}

export function add(contacts: Contact[], input: Omit<Contact, "id">): Contact {
  const id = contacts.reduce((max, c) => Math.max(max, c.id), 0) + 1;
  const contact = { id, ...input };
  contacts.push(contact);
  return contact;
}

export function edit(contacts: Contact[], id: number, field: "name" | "phone" | "email", value: string): Contact {
  const contact = contacts.find((c) => c.id === id);
  if (!contact) throw new Error(`No contact with id ${id}`);
  contact[field] = value;
  return contact;
}
