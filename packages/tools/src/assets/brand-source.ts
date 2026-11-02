import { createHash } from "node:crypto";

import { isValidRelativeAssetPath } from "./manifest.ts";

/** Where Coden's brand is published; its index is `index.json` below it. */
export const BRAND_URL = "https://coden.agency/brand/";

/** The only index `version` this reader understands. */
const INDEX_VERSION = 1;
/** An index far larger than this is not the brand index. */
const MAX_INDEX_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const SHA256 = /^[0-9a-f]{64}$/;

/** One file the brand index lists. */
export interface BrandFile {
  /** Path relative to the brand URL, such as `assets/logo/logo-dark.svg`. */
  path: string;
  /** Size in bytes. */
  size: number;
  /** Lowercase hexadecimal SHA-256. */
  sha256: string;
}

/**
 * The brand could not be reached: a network failure, a timeout, or a server error.
 *
 * Kept apart from every other failure because it is the only one a caller may
 * tolerate. A missing file, a malformed index, or a hash mismatch means the brand
 * or the request is wrong, and waiting will not fix it.
 */
export class BrandUnreachableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BrandUnreachableError";
  }
}

/** Where `hub assets` and `hub check` read the brand from. */
export interface BrandSource {
  /**
   * Finds the file a `codenhub.assets` entry names.
   * @param from The entry's `from`, relative to the brand's `assets/`.
   * @returns The listed file, or `undefined` when the brand does not publish it.
   * @throws {BrandUnreachableError} When the index cannot be fetched.
   */
  lookup(from: string): Promise<BrandFile | undefined>;
  /**
   * Downloads a listed file and checks it against the index.
   * @param file A file {@link lookup} returned.
   * @returns The file's bytes.
   * @throws {BrandUnreachableError} When the file cannot be fetched.
   * @throws When the bytes do not match the index's size or SHA-256.
   */
  download(file: BrandFile): Promise<Uint8Array>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIndex(value: unknown, url: string): Map<string, BrandFile> {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new Error(`The brand index at ${url} is malformed: expected an object with a "files" array.`);
  }
  if (value.version !== INDEX_VERSION) {
    throw new Error(
      `The brand index at ${url} has version ${String(value.version)}; this hub reads version ${INDEX_VERSION}. Update @codenhub/tools.`,
    );
  }
  const files = new Map<string, BrandFile>();
  for (const [index, entry] of value.files.entries()) {
    if (
      !isRecord(entry) ||
      typeof entry.path !== "string" ||
      !isValidRelativeAssetPath(entry.path) ||
      typeof entry.size !== "number" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      typeof entry.sha256 !== "string" ||
      !SHA256.test(entry.sha256)
    ) {
      throw new Error(
        `The brand index at ${url} is malformed: files[${index}] needs a safe path, a size, and a sha256.`,
      );
    }
    files.set(entry.path, { path: entry.path, sha256: entry.sha256, size: entry.size });
  }
  return files;
}

/** Options for {@link createBrandSource}; the defaults read the published brand. */
export interface BrandSourceOptions {
  /** The brand's base URL, ending in a slash. */
  baseUrl?: string;
  /** The `fetch` to use. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Creates a source that reads the published brand over HTTPS. The index is fetched
 * once per source and shared by every lookup.
 * @param options Base URL and `fetch`, for tests.
 * @returns The source.
 */
export function createBrandSource(options: BrandSourceOptions = {}): BrandSource {
  const baseUrl = options.baseUrl ?? BRAND_URL;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let index: Promise<Map<string, BrandFile>> | undefined;

  async function request(url: string): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (cause) {
      throw new BrandUnreachableError(`Could not reach ${url}: ${(cause as Error).message}`, { cause });
    }
    if (response.status >= 500) {
      throw new BrandUnreachableError(`${url} answered ${response.status}.`);
    }
    if (!response.ok) {
      throw new Error(`${url} answered ${response.status}.`);
    }
    return response;
  }

  async function readBytes(url: string, response: Response): Promise<Uint8Array> {
    try {
      return new Uint8Array(await response.arrayBuffer());
    } catch (cause) {
      throw new BrandUnreachableError(`Could not read ${url}: ${(cause as Error).message}`, { cause });
    }
  }

  async function loadIndex(): Promise<Map<string, BrandFile>> {
    const url = new URL("index.json", baseUrl).href;
    const bytes = await readBytes(url, await request(url));
    if (bytes.byteLength > MAX_INDEX_BYTES) {
      throw new Error(
        `The brand index at ${url} is ${bytes.byteLength} bytes, over the ${MAX_INDEX_BYTES}-byte limit.`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error(`The brand index at ${url} is not JSON.`);
    }
    return parseIndex(parsed, url);
  }

  return {
    async lookup(from) {
      index ??= loadIndex();
      // A failed fetch is not cached, so a later lookup in the same run retries it.
      const files = await index.catch((cause: unknown) => {
        index = undefined;
        throw cause;
      });
      return files.get(`assets/${from}`);
    },
    async download(file) {
      const url = new URL(file.path, baseUrl).href;
      const bytes = await readBytes(url, await request(url));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== file.size || sha256 !== file.sha256) {
        throw new Error(
          `${url} does not match the brand index (${bytes.byteLength} bytes, sha256 ${sha256}; expected ${file.size} bytes, sha256 ${file.sha256}).`,
        );
      }
      return bytes;
    },
  };
}
