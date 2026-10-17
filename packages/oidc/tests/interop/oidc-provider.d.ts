/*
 * oidc-provider ships no types, and the interop suite uses a small part of it. This declares only that
 * part, so the tests type-check without adding @types/oidc-provider.
 */
declare module "oidc-provider" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  interface Interaction {
    readonly uid: string;
    readonly params: Readonly<Record<string, string>>;
  }

  interface Grant {
    addOIDCScope(scope: string): void;
    save(): Promise<string>;
  }

  export default class Provider {
    constructor(issuer: string, configuration?: Readonly<Record<string, unknown>>);
    proxy: boolean;
    readonly Grant: new (properties: { accountId: string; clientId: string }) => Grant;
    callback(): (request: IncomingMessage, response: ServerResponse) => void;
    interactionDetails(request: IncomingMessage, response: ServerResponse): Promise<Interaction>;
    interactionFinished(
      request: IncomingMessage,
      response: ServerResponse,
      result: Readonly<Record<string, unknown>>,
      options?: Readonly<{ mergeWithLastSubmission?: boolean }>,
    ): Promise<void>;
  }
}
