import { defineConfig } from "tsdown";

// The build script's flags set everything else. A hidden map adds no
// `sourceMappingURL` comment to the published code, and `files` keeps the map
// out of the tarball; it exists so the release size measurement can attribute
// bytes to source files (docs/specs/packages-lifecycle.md, "Bundle size").
export default defineConfig({
  sourcemap: "hidden",
});
