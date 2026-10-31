import { matchFuzzy, type FuzzyMatch } from "./fuzzy.ts";

export interface SearchEntry {
  /** Package label the entry belongs to, such as `Styles`. */
  packageLabel: string;
  /** Route to open, including the heading fragment for section entries. */
  route: string;
  /** Heading text when the entry is a section, absent for a whole document. */
  section?: string;
  /** Prose under the entry, already stripped of markup. */
  text: string;
  /** Document title the entry belongs to. */
  title: string;
}

export interface SearchResult {
  entry: SearchEntry;
  /** Indices matched in the entry's most relevant label, for highlighting. */
  positions: number[];
  score: number;
}

export interface SearchOptions {
  limit?: number;
}

const DEFAULT_LIMIT = 8;
const EXACT_LABEL_BONUS = 20;
const BODY_SCORE = 12;

/**
 * Floor a match must clear to be shown at all.
 *
 * Set to the body score deliberately: finding the query written out in the
 * prose is the weakest evidence worth surfacing, so a label a query only
 * reaches by skipping most of it does not qualify.
 */
const MINIMUM_SCORE = BODY_SCORE;

/**
 * Ranks index entries against a query.
 *
 * Labels (section heading, document title, package) are matched fuzzily, since
 * those are what a reader types from memory and mistypes. Body prose is only
 * checked for a literal substring: it is orders of magnitude longer, and a
 * fuzzy subsequence over a paragraph matches almost anything. An entry needs a
 * label match or a body hit to appear at all.
 *
 * The package name and document title only lift whole documents, never their
 * individual sections. Typing either asks for pages, and scoring every heading
 * inside them equally would bury them under their own contents. A query that
 * equals a label outright is a deliberate hit rather than a fuzzy guess, so it
 * takes a bonus that clears near-miss matches elsewhere.
 * Package labels carry the same weight as headings so a package lookup still
 * surfaces its pages among symbols that begin with the package name.
 *
 * A literal phrase found in prose outscores a scattered label match, because a
 * label the query only reaches by skipping most of it is the weaker signal of
 * the two, and a match weaker than that is dropped rather than ranked last.
 *
 * Results are sorted by score, then alphabetically so equal scores stay stable
 * across builds rather than following index order.
 */
export function searchDocumentation(
  entries: readonly SearchEntry[],
  query: string,
  { limit = DEFAULT_LIMIT }: SearchOptions = {},
): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const needle = trimmed.toLowerCase();
  const results: SearchResult[] = [];

  // A member is labelled `Owner.member`; typing the member's own name is as deliberate as typing the whole label.
  const isExactLabel = (label: string) => {
    const lower = label.toLowerCase();
    return lower === needle || lower.slice(lower.lastIndexOf(".") + 1) === needle;
  };
  const scoreLabel = (match: FuzzyMatch | undefined, label: string) =>
    match === undefined ? 0 : match.score + (isExactLabel(label) ? EXACT_LABEL_BONUS : 0);

  for (const entry of entries) {
    const label = entry.section ?? entry.title;
    const labelMatch = matchFuzzy(trimmed, label);
    const isSection = entry.section !== undefined;
    const packageMatch = isSection ? undefined : matchFuzzy(trimmed, entry.packageLabel);
    const bodyScore = entry.text.toLowerCase().includes(needle) ? BODY_SCORE : 0;

    const score = Math.max(scoreLabel(labelMatch, label), scoreLabel(packageMatch, entry.packageLabel), bodyScore);

    if (score >= MINIMUM_SCORE) {
      results.push({ entry, positions: labelMatch?.positions ?? [], score });
    }
  }

  results.sort((left, right) => right.score - left.score || left.entry.route.localeCompare(right.entry.route));

  return results.slice(0, limit);
}
