/**
 * Runs an async operation over every item, one at a time, preserving input order.
 *
 * Sequential execution keeps interleaved child-process output readable and makes
 * failures reproducible.
 * @param items Items to process in order.
 * @param run Operation applied to each item.
 * @returns Results in the same order as `items`.
 */
export async function mapSeries<TItem, TResult>(
  items: readonly TItem[],
  run: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = [];

  async function runFrom(index: number): Promise<void> {
    if (index >= items.length) {
      return;
    }
    results.push(await run(items[index] as TItem, index));
    await runFrom(index + 1);
  }

  await runFrom(0);
  return results;
}

/**
 * Runs an async operation over every item with a bounded number of concurrent
 * operations, preserving input order in the returned results.
 * @param items Items to process.
 * @param limit Maximum number of operations running at the same time.
 * @param run Operation applied to each item.
 * @returns Results in the same order as `items`.
 * @throws When `limit` is not a positive integer.
 */
export async function mapConcurrent<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  run: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Invalid concurrency limit: expected a positive integer, received ${limit}.`);
  }
  if (limit === 1) {
    return mapSeries(items, run);
  }

  const results = Array.from<TResult>({ length: items.length });
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= items.length) {
      return;
    }
    results[index] = await run(items[index] as TItem, index);
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()));
  return results;
}
