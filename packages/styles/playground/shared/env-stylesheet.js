/* Classic script, deliberately not a module: it must run synchronously, before
   the parser reaches <body>, so `document.write` lands the stylesheet <link>
   before first paint. A `type="module"` script is always deferred -- it runs
   after the document has parsed -- so doing this from a module would paint the
   page unstyled first. Everything that does not need to run before paint lives
   in `playground.js` instead, which reads `documentRoot.dataset.env` -- set
   here -- rather than re-deriving the environment itself.

   `demo/vite.config.ts` drops this tag from the built demo entirely: a demo
   only ever runs one build, chosen by which virtual chrome module it imports,
   so there is nothing here for it to pick between. Leaving `dataset.env`
   unset in that case is what makes `playground.js` default to "vanilla". */
const documentRoot = document.documentElement;
const params = new URLSearchParams(window.location.search);
const isNative = documentRoot.dataset.entry === "native";
const environmentParam = params.get("env");
const environment = environmentParam === "build" || (environmentParam === null && isNative) ? "build" : "vanilla";
const stylesheet = isNative
  ? environment === "build"
    ? "/native/entry-tw.css"
    : "/native/entry-vanilla.css"
  : environment === "build"
    ? "/shared/entry-tw.css"
    : "/shared/entry-vanilla.css";

document.write(`<link rel="stylesheet" href="${stylesheet}" />`);
documentRoot.dataset.env = environment;
