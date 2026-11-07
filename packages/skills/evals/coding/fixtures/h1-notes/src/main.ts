import { createApp } from "./server.ts";
import { createMemoryStore } from "./store.ts";

createApp(createMemoryStore()).listen(Number(process.env.PORT ?? 3000));
