export interface FuzzyMatch {
  /** Indices in the target that the query matched, ascending. */
  positions: number[];
  /** Higher is a better match. Only comparable between matches of one query. */
  score: number;
}

const WORD_BOUNDARY = /[\s\-_./:]/;

const isWordStart = (target: string, index: number) => {
  if (index === 0) {
    return true;
  }

  const previous = target[index - 1] ?? "";
  const current = target[index] ?? "";

  return WORD_BOUNDARY.test(previous) || (previous === previous.toLowerCase() && current !== current.toLowerCase());
};

// A space in the query stands for any separator, so `ArrayOptions min`, typed
// from the heading `ArrayOptions › min`, finds the label `ArrayOptions.min`.
const indexOfCharacter = (lowerTarget: string, character: string, from: number) => {
  if (!/\s/.test(character)) {
    return lowerTarget.indexOf(character, from);
  }
  for (let index = from; index < lowerTarget.length; index++) {
    if (WORD_BOUNDARY.test(lowerTarget[index] ?? "")) {
      return index;
    }
  }
  return -1;
};

// `lowerTarget` drives the case-insensitive search while `target` drives the
// boundary test, because a lowercased string has no camelCase transitions left.
const collectPositions = (query: string, lowerTarget: string, target: string, preferWordStart: boolean) => {
  const positions: number[] = [];
  let cursor = 0;

  for (const character of query) {
    let index = indexOfCharacter(lowerTarget, character, cursor);
    if (index === -1) {
      return undefined;
    }

    // A separator does not start a word, so preferring one would only skip ahead.
    while (preferWordStart && !/\s/.test(character) && !isWordStart(target, index)) {
      const next = lowerTarget.indexOf(character, index + 1);
      if (next === -1) {
        break;
      }

      index = next;
    }

    positions.push(index);
    cursor = index + 1;
  }

  return positions;
};

const CONSECUTIVE_BONUS = 16;
const WORD_START_BONUS = 8;
const LEADING_BONUS = 10;
const GAP_PENALTY = 2;
const MAX_GAP_PENALTY = 12;

const scorePositions = (positions: readonly number[], query: string, target: string) => {
  let score = 0;

  for (const [order, index] of positions.entries()) {
    const previous = positions[order - 1];
    score += 1;

    if (previous !== undefined) {
      const gap = index - previous - 1;

      // Every character skipped between two matches is evidence the query was
      // not written about this target. Without this, "soft" scores well against
      // "Supported Format" purely on the word starts it lands on.
      score += gap === 0 ? CONSECUTIVE_BONUS : -Math.min(gap * GAP_PENALTY, MAX_GAP_PENALTY);
    }

    if (isWordStart(target, index)) {
      score += WORD_START_BONUS;
    }

    if (index === 0) {
      score += LEADING_BONUS;
    }
  }

  // Shorter targets are the more specific answer to the same matched query.
  return score - Math.min(target.length - query.length, 20) * 0.1;
};

/**
 * Scores `query` as a subsequence of `target`, case-insensitively.
 *
 * Matching prefers characters that start a word, so `pt` lands on
 * "Presentation Tokens" rather than the `p` and `t` inside "Prompt". That
 * preference can skip past the only viable alignment, so a plain left-to-right
 * pass runs as a fallback and the query counts as matched if either pass
 * succeeds. Runs of adjacent characters and a match at the very start of the
 * target score higher, and every character skipped between two matches costs,
 * which is what separates a near-literal hit from a scattered one. A scattered
 * match can therefore score at or below zero, and callers are expected to drop
 * it rather than rank it.
 *
 * Returns `undefined` when the query is not a subsequence of the target.
 */
export function matchFuzzy(query: string, target: string): FuzzyMatch | undefined {
  if (query.length === 0) {
    return { positions: [], score: 0 };
  }

  // Each query space claims a separator in the target, so a doubled space would need two.
  const lowerQuery = query.toLowerCase().replace(/\s+/g, " ");
  const lowerTarget = target.toLowerCase();
  const positions =
    collectPositions(lowerQuery, lowerTarget, target, true) ?? collectPositions(lowerQuery, lowerTarget, target, false);

  if (positions === undefined) {
    return undefined;
  }

  return { positions, score: scorePositions(positions, lowerQuery, target) };
}
