export interface Options {
  bail: boolean;
  config: string;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = { bail: false, config: "tasks.json" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--bail") {
      options.bail = true;
    } else if (arg === "--config") {
      const value = argv[++i];
      if (!value) throw new Error("--config needs a path");
      options.config = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}
