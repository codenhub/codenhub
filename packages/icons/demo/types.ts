/** One icon of the selected family, as the demo renders it. */
export interface IconEntry {
  /** Primary icon name inside its family. */
  name: string;
  /** Utility class that renders it, such as `ic-lucide-heart`. */
  className: string;
  /** Search keywords, lowercased. */
  tags: string[];
}
