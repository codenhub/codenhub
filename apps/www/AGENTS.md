# apps/www

## Traps

- `astro build` fails with a rolldown `PARSE_ERROR` ("Expected `,` or `}`") when an icon tag such as `'<i class="ic-lucide-tag"></i>'` is written inside a frontmatter string. Under Astro 7.4.2, Astro's own `pre` plugin compiles the `.astro` file before the `@codenhub/icons` svg-mode transform runs, so the transform sees compiled JavaScript with no `---` fence, treats it as markup, and inserts the `<svg>` without escaping its quotes. The icons docs say frontmatter strings are rewritten; in this app they are not (codenhub/codenhub#451). For an icon chosen from data, import its `virtual:@codenhub/icons/…` module and render it with `decorative` from `src/lib/icon.ts`; otherwise write a literal `<i>` tag in the template.
