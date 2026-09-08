/// <reference types="astro/client" />

// Served by `@codenhub/icons/vite` in CSS mode. The base layout imports it so an
// Astro host injects the generated mask stylesheet — Astro never runs
// `transformIndexHtml` for its own pages, which is the hook the plugin would
// otherwise use.
declare module "virtual:icons.css";
