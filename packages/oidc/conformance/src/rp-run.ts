// Runs the OpenID conformance suite's RP plans against @codenhub/oidc's client, from this machine: the suite plays
// the provider, and this script plays both the browser and the relying party. docs/runbook.md, "The client's RP
// plans", says how to run it. Usage, from packages/oidc/conformance after `pnpm build oidc`:
//
//   node src/rp-run.ts plan basic|config
//   node src/rp-run.ts run <planId> [module,...]
//
// SUITE_TOKEN_FILE names a file holding a token from the suite's Tokens page, and RP_SECRET_FILE one holding the
// client secret the plan registers. Neither value is ever printed.

/* oxlint-disable no-await-in-loop, no-console -- The suite runs one module per alias at a time and is polled, so
   every step waits for the one before it, and what this script prints is its result. */
import { readFileSync } from "node:fs";

import { connect, type Outcome } from "./rp.ts";

const SUITE_ORIGIN = process.env["SUITE_ORIGIN"] ?? "https://www.certification.openid.net";
const ALIAS = process.env["RP_ALIAS"] ?? "codenhub-oidc-rp";
const CLIENT_ID = "codenhub-rp";
// Never requested: the browser here stops at the redirect, so the URI only has to be one the plan registers.
const REDIRECT_URI = "https://rp.codenhub-oidc.example/callback";
// Longer than the 30-second default cooldown of @codenhub/jwt's remote key set, which holds back a refetch for an
// unknown kid. A deployed app signs users in further apart than a script does.
const SECOND_SIGN_IN_DELAY_MS = 35_000;
const MAX_SIGN_INS = 3;
const MODULE_DEADLINE_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;

const PLANS = {
  basic: {
    name: "oidcc-client-basic-certification-test-plan",
    variant: { client_registration: "static_client", request_type: "plain_http_request" },
  },
  config: {
    name: "oidcc-client-config-certification-test-plan",
    variant: {
      client_registration: "static_client",
      request_type: "plain_http_request",
      client_auth_type: "client_secret_basic",
      response_mode: "default",
    },
  },
} as const;

const token = readSecret("SUITE_TOKEN_FILE");
const secret = readSecret("RP_SECRET_FILE");

function readSecret(name: string): string {
  const path = process.env[name];
  if (path === undefined || path === "") {
    throw new Error(`Set ${name} to the path of the file that holds it. See docs/runbook.md.`);
  }
  return readFileSync(path, "utf8").trim();
}

/** Replaces the token and the secret wherever a suite error could have echoed them. */
function redact(text: string): string {
  return text.split(token).join("<redacted>").split(secret).join("<redacted>");
}

async function api<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${SUITE_ORIGIN}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    // Covers the body too, so a stalled suite fails the module instead of holding every later one.
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} answered ${response.status}: ${redact(text).slice(0, 1000)}`);
  }
  try {
    return (text === "" ? null : JSON.parse(text)) as T;
  } catch {
    // A parse error quotes the text it read, which could echo the token or the secret.
    throw new Error(`${method} ${path} answered ${response.status} with a body that is not JSON`);
  }
}

interface PlanModule {
  readonly testModule: string;
  readonly variant?: Record<string, string>;
}

interface TestInfo {
  readonly status: string;
  readonly result: string | null;
}

const ENDED = new Set(["FINISHED", "INTERRUPTED"]);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function createPlan(kind: keyof typeof PLANS): Promise<void> {
  const plan = PLANS[kind];
  const query = new URLSearchParams({ planName: plan.name, variant: JSON.stringify(plan.variant) });
  const config = {
    alias: ALIAS,
    description: `@codenhub/oidc client, ${kind}`,
    client: { client_id: CLIENT_ID, client_secret: secret, redirect_uri: REDIRECT_URI },
  };
  const created = await api<{ id: string; modules: readonly PlanModule[] }>("POST", `/api/plan?${query}`, config);
  console.log(JSON.stringify({ plan: created.id, modules: created.modules.map((module) => module.testModule) }));
}

/** Runs one module to its end, signing in again while the suite still waits, and returns what it recorded. */
async function runModule(planId: string, module: PlanModule): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({
    test: module.testModule,
    plan: planId,
    variant: JSON.stringify(module.variant ?? {}),
  });
  const { id } = await api<{ id: string }>("POST", `/api/runner?${query}`);
  const info = (): Promise<TestInfo> => api<TestInfo>("GET", `/api/info/${id}`);
  const ended = async (): Promise<boolean> => ENDED.has((await info()).status);
  const deadline = Date.now() + MODULE_DEADLINE_MS;
  while ((await info()).status !== "WAITING" && !(await ended()) && Date.now() < deadline) {
    await sleep(1000);
  }
  const { exposed } = await api<{ exposed: { issuer: string } }>("GET", `/api/runner/${id}`);
  const signIns: Outcome[] = [];
  const party = await connect({
    issuer: exposed.issuer,
    clientId: CLIENT_ID,
    secret,
    redirectUri: REDIRECT_URI,
    fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  });
  if ("signIn" in party) {
    if (!(await ended())) {
      for (let attempt = 0; attempt < MAX_SIGN_INS; attempt++) {
        if (attempt > 0) {
          await sleep(SECOND_SIGN_IN_DELAY_MS);
          if (await ended()) {
            break;
          }
        }
        signIns.push(await party.signIn(ended));
      }
    }
  } else {
    signIns.push(party);
  }
  let last = await info();
  while (!ENDED.has(last.status) && Date.now() < deadline) {
    await sleep(2000);
    last = await info();
  }
  return { module: module.testModule, test: id, status: last.status, result: last.result, signIns };
}

async function runPlan(planId: string, only: readonly string[]): Promise<void> {
  const plan = await api<{ modules: readonly PlanModule[] }>("GET", `/api/plan/${planId}`);
  for (const module of plan.modules) {
    if (only.length > 0 && !only.includes(module.testModule)) {
      continue;
    }
    try {
      console.log(JSON.stringify(await runModule(planId, module)));
    } catch (error) {
      console.log(JSON.stringify({ module: module.testModule, error: redact(String(error)).slice(0, 1000) }));
    }
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "plan" && (args[0] === "basic" || args[0] === "config")) {
  await createPlan(args[0]);
} else if (command === "run" && args[0] !== undefined) {
  await runPlan(args[0], args[1]?.split(",") ?? []);
} else {
  console.error("Usage: node src/rp-run.ts plan basic|config | run <planId> [module,...]");
  process.exitCode = 1;
}
