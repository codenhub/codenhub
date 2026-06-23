# Bubble Plugins

This workspace category stores source code, configurations, and build assets for Bubble.io plugins.

Integrating with Bubble's native GitHub sync can be problematic, so this repository serves as the single source of truth. All changes are developed, compiled, and optimized locally before being published (via copy-paste) to the Bubble dashboard.

## Folder Structure

- [core/](file:///c:/Users/gustavo.motta/Projects/codenhub/packages/plugins/bubble/core) - Shared types, build configurations, and packaging utilities (`bubble-plugin`).
- [template/](file:///c:/Users/gustavo.motta/Projects/codenhub/packages/plugins/bubble/template) - Reusable plugin template (`@codenhub/bubble-template`) to kickstart new plugins.
- [docs/](file:///c:/Users/gustavo.motta/Projects/codenhub/packages/plugins/bubble/docs) - Detailed development and publishing guides.
  - [development.md](file:///c:/Users/gustavo.motta/Projects/codenhub/packages/plugins/bubble/docs/development.md) - Coding guidelines, TS structures, and element lifecycles.
  - [publishing.md](file:///c:/Users/gustavo.motta/Projects/codenhub/packages/plugins/bubble/docs/publishing.md) - How to build, copy-paste outputs, and sync config.

## Development Workflow

1. **Create a plugin**: Copy `packages/plugins/bubble/template` to `packages/plugins/bubble/<your-plugin-name>`.
2. **Configure metadata**: Update `bubble.json` with your plugin's parameters, actions, and fields.
3. **Write TypeScript**: Develop client-side actions, server-side actions, or custom elements in `src/`.
4. **Build and optimize**: Run `pnpm build` in your plugin folder. Outputs are generated under `dist/`.
5. **Sync to Bubble**: Copy-paste built code from `dist/` into the corresponding fields in the Bubble Plugin Editor dashboard.

## Active Plugins

_No plugins have been added yet._
