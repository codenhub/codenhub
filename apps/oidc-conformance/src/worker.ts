import { createHost, type Host, type HostConfig } from "./host";

/** The suite's origin, where the callback of every test plan lives. */
const SUITE_ORIGIN = "https://www.certification.openid.net";

/** The binding to the Durable Object, and the variables and secrets `wrangler.jsonc` and `wrangler secret` set. */
export interface Env {
  readonly HOST: HostNamespace;
  readonly ISSUER: string;
  readonly SUITE_ALIAS: string;
  /** Overrides the suite's origin, for a suite deployed elsewhere. */
  readonly SUITE_ORIGIN?: string;
  readonly CLIENT_SECRET_1: string;
  readonly CLIENT_SECRET_2: string;
  readonly CLIENT_SECRET_POST: string;
  readonly CLIENT_SECRET_CONTROL: string;
}

/** The part of a Durable Object namespace this Worker uses. */
export interface HostNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

/**
 * Reads the host's configuration from the environment.
 *
 * @throws Error naming each missing variable, never a value.
 */
export function readConfig(env: Partial<Omit<Env, "HOST">>): HostConfig {
  const missing = [
    "ISSUER",
    "SUITE_ALIAS",
    "CLIENT_SECRET_1",
    "CLIENT_SECRET_2",
    "CLIENT_SECRET_POST",
    "CLIENT_SECRET_CONTROL",
  ].filter((name) => !env[name as keyof typeof env]);
  if (missing.length > 0) {
    throw new Error(`Missing configuration: ${missing.join(", ")}. See docs/runbook.md.`);
  }
  return {
    issuer: env.ISSUER as string,
    suiteOrigin: env.SUITE_ORIGIN || SUITE_ORIGIN,
    alias: env.SUITE_ALIAS as string,
    secrets: {
      first: env.CLIENT_SECRET_1 as string,
      second: env.CLIENT_SECRET_2 as string,
      post: env.CLIENT_SECRET_POST as string,
      control: env.CLIENT_SECRET_CONTROL as string,
    },
  };
}

/**
 * The one object that holds the provider and its store, so every request sees the same codes, tokens and sessions.
 * Its state is in memory on purpose: this is a test host, and losing it when the object is evicted only
 * fails the test that was running.
 */
export class ConformanceHost {
  private host: Promise<Host> | undefined;

  constructor(
    _state: unknown,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    try {
      // A failed start is kept, so a broken host answers the same way every time instead of half starting.
      this.host ??= createHost(readConfig(this.env));
      return await (await this.host).fetch(request);
    } catch (error) {
      console.error("Conformance host failed:", error instanceof Error ? error.message : "unknown error");
      return new Response(`Conformance host failed: ${error instanceof Error ? error.message : "unknown error"}\n`, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.HOST.get(env.HOST.idFromName("conformance")).fetch(request);
  },
};
