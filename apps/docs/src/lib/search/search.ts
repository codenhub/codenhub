import { matchFuzzy, type FuzzyMatch } from "./fuzzy";

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
const SECTION_WEIGHT = 0.92;
const PACKAGE_WEIGHT = 0.8;
const EXACT_LABEL_BONUS = 20;
const BODY_SCORE = 6;

/**
 * Ranks index entries against a query.
 *
 * Labels (section heading, document title, package) are matched fuzzily, since
 * those are what a reader types from memory and mistypes. Body prose is only
 * checked for a literal substring: it is orders of magnitude longer, and a
 * fuzzy subsequence over a paragraph matches almost anything. An entry needs a
 * label match or a body hit to appear at all.
 *
 * The package name only lifts that package's documents, never its individual
 * sections. Typing a package name asks for its pages, and scoring every heading
 * inside it equally would bury them under their own contents. A query that
 * equals a label outright is a deliberate hit rather than a fuzzy guess, so it
 * takes a bonus that clears near-miss matches elsewhere.
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

  const scoreLabel = (match: FuzzyMatch | undefined, label: string) =>
    match === undefined ? 0 : match.score + (label.toLowerCase() === needle ? EXACT_LABEL_BONUS : 0);

  for (const entry of entries) {
    const label = entry.section ?? entry.title;
    const labelMatch = matchFuzzy(trimmed, label);
    const isSection = entry.section !== undefined;
    const titleMatch = isSection ? matchFuzzy(trimmed, entry.title) : undefined;
    const packageMatch = isSection ? undefined : matchFuzzy(trimmed, entry.packageLabel);
    const bodyScore = entry.text.toLowerCase().includes(needle) ? BODY_SCORE : 0;

    const score = Math.max(
      scoreLabel(labelMatch, label),
      scoreLabel(titleMatch, entry.title) * SECTION_WEIGHT,
      scoreLabel(packageMatch, entry.packageLabel) * PACKAGE_WEIGHT,
      bodyScore,
    );

    if (score > 0) {
      results.push({ entry, positions: labelMatch?.positions ?? [], score });
    }
  }

  results.sort((left, right) => right.score - left.score || left.entry.route.localeCompare(right.entry.route));

  return results.slice(0, limit);
}
