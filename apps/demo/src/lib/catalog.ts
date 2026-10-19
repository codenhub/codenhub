const DEMO_MANIFEST_PATTERN = /\/packages\/([^/]+)\/demo\/package\.json$/;

const demoManifestPaths = Object.keys(import.meta.glob("../../../../packages/*/demo/package.json"));

function toSlug(manifestPath: string): string {
  const match = DEMO_MANIFEST_PATTERN.exec(manifestPath);
  if (match === null) {
    throw new Error(`Unable to derive a package slug from ${manifestPath}.`);
  }
  return match[1];
}

/** Path segment each package demo is mounted under, sorted so the sitemap is stable. */
export const demoSlugs: string[] = demoManifestPaths.map(toSlug).sort();
