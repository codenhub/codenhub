# Bubble Plugin Publishing Guide

Bubble.io does not offer a direct CLI upload interface for plugin code. Therefore, publishing compiled code is a manual copy-paste process.

## Step 1: Run the Build Pipeline

From your plugin package folder, run the build script:

```sh
pnpm build
```

This compiles your TypeScript files into standalone JavaScript bundles under the `dist/` directory.

---

## Step 2: Copy-Paste Code into Bubble Editor

Go to your Bubble Plugin Editor dashboard and paste the contents of the generated files:

### Client & Server Actions

1. Open the **Actions** tab in Bubble.
2. Select your Action.
3. Locate the code block text areas.
4. Copy the compiled code from `dist/actions/<action-name>.js`.
5. Paste it directly into the Bubble editor's code box.

> [!IMPORTANT]
> The build process strips export markers (like `export function action(...)`) and bundles imports so that the output runs cleanly inside Bubble's sandbox environment.

### Visual Elements

1. Open the **Element** tab in Bubble.
2. Select your custom Element.
3. Paste the contents of:
   - `dist/elements/<element-name>/initialize.js` into the **Initialize** code box.
   - `dist/elements/<element-name>/update.js` into the **Update** code box.
   - `dist/elements/<element-name>/preview.js` into the **Preview** code box.

---

## Step 3: Keep `bubble.json` and Bubble Dashboard Synced

The `bubble.json` file in your plugin folder represents the parameters, fields, and states configured in the Bubble dashboard.

Whenever you add a new input parameter or state to your plugin:

1. Configure it in the Bubble dashboard.
2. Update the parameter list in `bubble.json` so the local configuration matches the cloud configuration.
3. Add the parameter key to your TypeScript interfaces (`MyActionProperties` or `ElementProperties`) to maintain full type-safety.
