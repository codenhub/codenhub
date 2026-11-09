# Agent instructions: apps/docs

## Traps

- **A missing `.md` URL answers 404 labelled `text/markdown`.** `public/_headers` sets `Content-Type: text/markdown; charset=utf-8` on every `/*.md` path, and Cloudflare applies `_headers` whether or not the file exists, so the HTML not-found page goes out under that label. Dropping the rule leaves real Markdown without a charset, and non-ASCII pages open garbled in a browser; a UTF-8 BOM or a Worker would fix the 404 at the cost of every file's bytes or new machinery. The status stays correct, so prefer keeping the rule and checking the status. Held on Workers static assets (`wrangler.jsonc`, `not_found_handling: "404-page"`) on 2026-11-09; check with `curl -sI https://docs.codenhub.dev/theme/no-such-page/index.md`. See [#510](https://github.com/codenhub/codenhub/issues/510).
