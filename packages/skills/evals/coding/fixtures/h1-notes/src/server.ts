import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { NotesStore } from "./store.ts";

export function createApp(store: NotesStore) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const userId = req.headers["x-user-id"];
    if (typeof userId !== "string" || userId === "") {
      return send(res, 401, { error: "Missing user." });
    }
    const match = /^\/notes\/([^/]+)$/.exec(req.url ?? "");
    if (!match) return send(res, 404, { error: "Not found." });

    if (req.method === "GET") {
      const note = await store.get(match[1]);
      if (!note || note.ownerId !== userId) return send(res, 404, { error: "Not found." });
      return send(res, 200, note);
    }
    send(res, 405, { error: "Method not allowed." });
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
