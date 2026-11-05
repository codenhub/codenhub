/**
 * The site's own text in English, the default locale. Every other locale is
 * typed against this one, so a key missing from a translation fails to compile.
 * Package READMEs, descriptions, and the documentation stay in English.
 */
export const en = {
  site: {
    description:
      "The packages, apps, and standards behind coden.agency — one index, with links to docs, demos, and source.",
  },
  language: {
    label: "Language",
  },
  shell: {
    skipToContent: "Skip to main content",
    home: "{site} home",
    sitesNav: "Sites",
    nav: { documentation: "Documentation", demo: "Demo", packages: "Packages" },
    github: "CodenHub on GitHub",
    npm: "CodenHub on npm",
    theme: { toggle: "Switch theme", toDark: "Switch to dark theme", toLight: "Switch to light theme" },
    builtBy: "Built by",
    status: { deprecated: "Deprecated", experimental: "Experimental" },
    copy: { copied: "Copied", failed: "Copy failed", retry: "Copy failed. Try again" },
    search: {
      trigger: "Search",
      label: "Search documentation",
      results: "Search results",
      idle: "Type to search every package document.",
      unavailable: "Search is unavailable right now. Try again in a moment.",
      empty: "No documentation matches “{query}”.",
      countOne: "{count} result. Use the arrow keys to choose one.",
      countOther: "{count} results. Use the arrow keys to choose one.",
    },
  },
  home: {
    hero: {
      title: "Foundations,",
      titleEnd: "not frameworks.",
      lede: "Small, focused packages for building on the web platform: styles, icons, validation, auth, routing, and more. Take the one you need and skip the rest.",
    },
    browse: "Browse packages",
    searchDocs: "Search the docs",
    principles: {
      title: "Small on purpose.",
      titleEnd: "Checked on every release.",
      platform: {
        title: "Built on the platform",
        body: "Web Crypto, the Fetch API, native Web Components, and plain CSS. The packages lean on what browsers and runtimes already ship instead of reimplementing it.",
      },
      measured: {
        title: "Measured at every release",
        body: "Each release records every entrypoint's minified, gzipped size, and publishing refuses a build that does not match it.",
      },
      documented: {
        title: "Documented for people and agents",
        body: "Guides, API reference, and changelogs, searchable in one place, plus llms.txt files your coding agent can read.",
      },
      published: {
        title: "Exactly what is on npm",
        body: "This site and the docs are built from release tags, not the main branch. What you read here is what the published version does.",
      },
    },
    areas: {
      title: "One toolkit,",
      titleEnd: "every layer of the app.",
      interface: {
        title: "Interface",
        body: "Design tokens, icons, themes, toasts, and shortcuts for browser UIs that load fast and stay accessible.",
      },
      application: {
        title: "Application",
        body: "Routing, state, and translations, without a framework to adopt first.",
      },
      trust: {
        title: "Trust boundaries",
        body: "Validate untrusted input, verify tokens, and speak OpenID Connect on Web Crypto and the Fetch API.",
      },
      tooling: {
        title: "Tooling",
        body: "Vite and Tauri plugins, and the agent skills Coden works with every day.",
      },
      more: {
        title: "More",
        body: "Everything else the workspace publishes.",
      },
    },
    releases: {
      title: "Recently",
      titleEnd: "released.",
      all: "All packages",
    },
    closing: {
      title: "Start with one package.",
      body: "Every package installs on its own, with its own docs and release history.",
    },
  },
  packages: {
    title: "Packages",
    description:
      "Every published CodenHub package, with its version and links to its documentation, demo, source, and npm release.",
    search: "Search packages",
    searchPlaceholder: "Search packages…",
    sortAsc: "Sort by name, ascending",
    sortDesc: "Sort by name, descending",
    empty: "No packages match your search.",
    card: {
      github: "{name} on GitHub",
      npm: "{name} on npm",
      lastPublished: "Last published",
    },
  },
  package: {
    description: "{name} on CodenHub.",
    back: "All packages",
    linksNav: "{name} links",
    copyName: "Copy package name",
    links: { documentation: "Documentation", changelog: "Changelog", demo: "Demo" },
    facts: {
      label: "At a glance",
      latestVersion: "Latest version",
      unreleased: "Unreleased",
      noStable: "No stable release",
      lastPublished: "Last published",
      license: "License",
      bundleSize: "Bundle size",
      dependencies: "Dependencies",
      peerDependencies: "Peer dependencies",
      none: "None",
      moduleFormat: "Module format",
      esmOnly: "ESM only",
      esmAndCjs: "ESM and CommonJS",
      types: "TypeScript types",
      included: "Included",
      notIncluded: "Not included",
      sideEffectFree: "Side-effect free",
      yes: "Yes",
      no: "No",
      bundles: "Bundles",
    },
    install: {
      title: "Install",
      runTitle: "Run",
      packageManager: "Package manager",
      copy: "Copy command",
    },
    details: "Package details",
    tabs: { readme: "README", entrypoints: "Entry points", releases: "Releases" },
    releases: {
      none: "No release yet.",
      version: "Version",
      published: "Published",
      actions: "Actions",
      latest: "Latest",
      prerelease: "Pre-release",
      copyInstall: "Copy install command for {version}",
      copyRun: "Copy run command for {version}",
      download: "Download {version} tarball",
    },
    entrypoints: {
      import: "Import",
      minified: "Minified",
      gzipped: "Gzipped",
      copyImport: "Copy import path",
      exportsOf: "Exports of {specifier}",
      share: "{share, number, percent} of the entry point",
      noRuntime: "Exports no runtime values.",
      measured: "Measured at release, peer dependencies left out.",
      measuredWith: "Measured at release with {bundler}, peer dependencies left out.",
      exportCost: "An export's size is what importing it alone costs after tree-shaking.",
      missingExports: "This release was cut before each entry point's exports were recorded.",
    },
  },
} as const;

/** The shape every locale's dictionary has: English's keys, any text. */
export type Dictionary = Widen<typeof en>;

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
