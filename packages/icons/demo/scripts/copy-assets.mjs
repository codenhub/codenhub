import { cpSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const source = path.resolve(__dirname, "../../../../assets");
const destination = path.resolve(__dirname, "../public/assets");

rmSync(destination, { force: true, recursive: true });
cpSync(source, destination, { recursive: true });
