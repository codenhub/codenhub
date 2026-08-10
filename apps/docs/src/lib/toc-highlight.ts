export interface HeadingPosition {
  /** Heading element id, matching the table-of-contents link target. */
  id: string;
  /** Heading offset from the top of the scrolling content, in pixels. */
  top: number;
}

export interface ActiveHeadingInput {
  headings: readonly HeadingPosition[];
  /** Distance below the scroll position at which a heading counts as reached. */
  offset: number;
  scrollHeight: number;
  scrollTop: number;
  viewportHeight: number;
}

/**
 * Resolves which heading a reader is currently under.
 *
 * The last section is a special case: it is usually too short to ever reach the
 * activation line, so a reader at the bottom of the page would otherwise see the
 * second-to-last entry highlighted.
 */
export function findActiveHeadingId({
  headings,
  offset,
  scrollHeight,
  scrollTop,
  viewportHeight,
}: ActiveHeadingInput): string | undefined {
  if (headings.length === 0) {
    return undefined;
  }

  if (scrollTop + viewportHeight >= scrollHeight - 2) {
    return headings[headings.length - 1]?.id;
  }

  const activationLine = scrollTop + offset;
  let activeId = headings[0]?.id;

  for (const heading of headings) {
    if (heading.top > activationLine) {
      break;
    }

    activeId = heading.id;
  }

  return activeId;
}
