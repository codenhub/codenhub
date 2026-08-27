export interface DemoPackage {
  label: string;
  slug: string;
}

interface DemoManifest {
  name?: string;
}

const manifestModules = import.meta.glob<DemoManifest>("../../../../packages/*/demo/package.json", {
  eager: true,
  import: "default",
});

function toSlug(manifestPath: string): string {
  const match = /\/packages\/([^/]+)\/demo\/package\.json$/.exec(manifestPath);
  if (match === null) {
    throw new Error(`Unable to derive a package slug from ${manifestPath}.`);
  }
  return match[1];
}

function toLabel(manifest: DemoManifest, slug: string): string {
  return manifest.name?.replace(/^@codenhub\//, "").replace(/-demo$/, "") ?? slug;
}

export const demoPackages: DemoPackage[] = Object.entries(manifestModules)
  .map(([manifestPath, manifest]) => {
    const slug = toSlug(manifestPath);
    return { label: toLabel(manifest, slug), slug };
  })
  .sort((left, right) => left.slug.localeCompare(right.slug));
