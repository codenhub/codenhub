export interface HighlightSegment {
  matched: boolean;
  text: string;
}

/**
 * Splits a label into alternating matched and unmatched runs.
 *
 * Grouping adjacent matches into one run keeps the rendered result readable:
 * marking every character separately turns a literal hit into a row of
 * one-letter fragments. Positions outside the label are ignored, so a stale
 * match cannot drop characters from the output.
 */
export function toHighlightSegments(label: string, positions: readonly number[]): HighlightSegment[] {
  const matched = new Set(positions.filter((position) => position >= 0 && position < label.length));
  const segments: HighlightSegment[] = [];

  // Indexed rather than iterated, because positions come from `indexOf` and are
  // therefore UTF-16 offsets, which code-point iteration would not line up with.
  for (let index = 0; index < label.length; index += 1) {
    const character = label[index] ?? "";
    const isMatched = matched.has(index);
    const last = segments.at(-1);

    if (last?.matched === isMatched) {
      last.text += character;
    } else {
      segments.push({ matched: isMatched, text: character });
    }
  }

  return segments;
}
