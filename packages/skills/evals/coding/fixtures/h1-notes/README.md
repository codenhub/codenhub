# notes-api

HTTP API for the notes app, on Node 24 with no framework. The gateway in front of it authenticates people and sets the `x-user-id` header; requests without it are rejected.

## Endpoints

- `GET /notes/:id` returns the note as JSON.

Run tests with `npm test`.
