# task-runner

Runs the setup commands, then every target command listed in `tasks.json`.

```sh
node src/cli.ts [--bail] [--config tasks.json]
```

## Options

- `--bail`: stop after the first failing target.
- `--config <path>`: config file to read. Defaults to `tasks.json`.

## Config

```json
{ "setup": ["pnpm install --frozen-lockfile"], "targets": ["pnpm lint", "pnpm test"] }
```

Exit code is 0 when every target passed, 1 otherwise.
