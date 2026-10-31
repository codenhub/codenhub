import { build, preview } from "astro";

// NODE_ENV=test selects working-tree package docs, as in the rendered-layout unit tests.
const started = performance.now();
await build({ logLevel: "silent" });
console.log(`Built working-tree docs in ${((performance.now() - started) / 1000).toFixed(1)}s`);
await preview({ server: { host: "127.0.0.1", port: 5195 } });
