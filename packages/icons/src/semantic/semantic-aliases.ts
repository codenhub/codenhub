/**
 * Curated semantic icon names mapped to the family icons that back them.
 *
 * These names describe intent rather than artwork, so markup written against
 * them survives a change of backing family. The map is editorial and
 * hand-maintained; it is never generated from family data. Replace or extend it
 * per project through `IconRegistryOptions.semanticAliases`.
 */
export const SEMANTIC_ALIASES: Record<string, string> = {
  add: "lucide:plus",
  back: "lucide:arrow-left",
  close: "lucide:x",
  collapse: "lucide:chevron-up",
  confirm: "lucide:check",
  copy: "lucide:copy",
  danger: "lucide:circle-alert",
  delete: "lucide:trash-2",
  download: "lucide:download",
  edit: "lucide:pencil",
  error: "lucide:circle-x",
  expand: "lucide:chevron-down",
  external: "lucide:external-link",
  filter: "lucide:funnel",
  forward: "lucide:arrow-right",
  help: "lucide:circle-question-mark",
  hide: "lucide:eye-off",
  home: "lucide:house",
  info: "lucide:info",
  loading: "lucide:loader-circle",
  menu: "lucide:menu",
  more: "lucide:ellipsis",
  next: "lucide:chevron-right",
  previous: "lucide:chevron-left",
  refresh: "lucide:refresh-cw",
  remove: "lucide:minus",
  save: "lucide:save",
  search: "lucide:search",
  settings: "lucide:settings",
  share: "lucide:share-2",
  show: "lucide:eye",
  success: "lucide:circle-check",
  upload: "lucide:upload",
  user: "lucide:user",
  warning: "lucide:triangle-alert",
};
