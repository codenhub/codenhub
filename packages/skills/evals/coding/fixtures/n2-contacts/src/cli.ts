import path from "node:path";
import { fileURLToPath } from "node:url";
import { add, edit, load, save } from "./contacts.ts";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "contacts.json");
const [command, ...args] = process.argv.slice(2);

try {
  const contacts = await load(file);
  if (command === "list") {
    for (const c of contacts) console.log(`${c.id}\t${c.name}\t${c.phone}\t${c.email}`);
  } else if (command === "add") {
    const [name, phone, email] = args;
    const contact = add(contacts, { name, phone, email });
    await save(file, contacts);
    console.log(`Added ${contact.id}`);
  } else if (command === "edit") {
    const [id, field, value] = args;
    edit(contacts, Number(id), field as "name" | "phone" | "email", value);
    await save(file, contacts);
    console.log(`Updated ${id}`);
  } else {
    console.error("Usage: cli.ts list | add <name> <phone> <email> | edit <id> <field> <value>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
