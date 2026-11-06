/** The subset of the Web Storage API the app uses; `localStorage` satisfies it. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
