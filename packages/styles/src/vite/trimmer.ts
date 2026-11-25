import { type Node, parse, purge, readPackageFile, serialize, usedClasses } from "../trim";
import { writeIfChanged } from "./output";
import type { FileEvent, ProjectScan } from "./scan";

export interface TrimmedImport {
  specifier: string;
  // The stylesheet trimmed, relative to the package root.
  source: string;
  // Where the trimmed copy is written.
  file: string;
}

interface TrimmerOptions {
  imports: readonly TrimmedImport[];
  scan: ProjectScan;
  // The class names the purge may drop.
  droppable: ReadonlySet<string>;
}

/* The trimmed files of one configuration, written again as the files the
   scan reads change. Changes are handled one at a time, in the order they
   come, so two writes of one file never race and the last change is the one
   written. */
export class Trimmer {
  readonly #scan: ProjectScan;
  readonly #droppable: ReadonlySet<string>;
  readonly #sources: readonly { file: string; tree: readonly Node[] }[];
  #queue: Promise<unknown> = Promise.resolve();
  // A write that failed is tried again on the next change, whether or not that change names a new class.
  #isStale = true;
  // Files a failed write rewrote, so the next write that succeeds still reports them.
  readonly #written = new Set<string>();

  private constructor(options: TrimmerOptions, trees: readonly (readonly Node[])[]) {
    this.#scan = options.scan;
    this.#droppable = options.droppable;
    this.#sources = options.imports.map(({ file }, index) => ({ file, tree: trees[index] }));
  }

  // Reads the project and writes every trimmed file.
  static async start(options: TrimmerOptions): Promise<Trimmer> {
    const trees = await Promise.all(options.imports.map(async ({ source }) => parse(await readPackageFile(source))));
    const trimmer = new Trimmer(options, trees);

    await options.scan.scanAll();
    await trimmer.#write();

    return trimmer;
  }

  // The trimmed files rewritten for the change: none when the project names the classes they already hold.
  change(file: string, event: FileEvent): Promise<string[]> {
    const handled = this.#handle(file, event, this.#queue);

    // A failed change does not stop the ones after it.
    this.#queue = Promise.allSettled([handled]);

    return handled;
  }

  // The trimmed files rewritten after reading every file again, which finds a file created where nothing watches.
  rescan(): Promise<string[]> {
    const handled = this.#handleRescan(this.#queue);

    this.#queue = Promise.allSettled([handled]);

    return handled;
  }

  async #handleRescan(before: Promise<unknown>): Promise<string[]> {
    await before;
    this.#isStale = (await this.#scan.scanAll()) || this.#isStale;

    return this.#isStale ? this.#write() : [];
  }

  async #handle(file: string, event: FileEvent, before: Promise<unknown>): Promise<string[]> {
    await before;
    this.#isStale = (await this.#scan.change(file, event)) || this.#isStale;

    return this.#isStale ? this.#write() : [];
  }

  // Every file the project's classes were read from.
  files(): string[] {
    return this.#scan.files();
  }

  async #write(): Promise<string[]> {
    const used = usedClasses(this.#scan.classes(), this.#droppable);
    // Every write settles before the next change starts one, even when another fails.
    const results = await Promise.allSettled(
      this.#sources.map(async ({ file, tree }) => {
        if (await writeIfChanged(file, serialize(purge(tree, used)))) {
          this.#written.add(file);
        }
      }),
    );
    const failed = results.find((result) => result.status === "rejected");

    if (failed !== undefined) {
      throw failed.reason;
    }

    this.#isStale = false;

    const written = this.#sources.map(({ file }) => file).filter((file) => this.#written.has(file));

    this.#written.clear();

    return written;
  }
}
