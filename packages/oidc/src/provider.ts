/**
 * Serve OpenID Connect endpoints and issue tokens through the Fetch API.
 *
 * @packageDocumentation
 */
export { createProvider } from "./provider/create-provider";
export { generateClientSecret, hashClientSecret } from "./provider/secrets";
export type {
  AccessTokenFormat,
  AccessTokenRecord,
  AuthorizationDenial,
  AuthorizationFailure,
  AuthorizationGrant,
  AuthorizationInteraction,
  ClaimsRequest,
  ClientAuthentication,
  ClientRecord,
  ClientTtl,
  CodeRecord,
  Consumption,
  Display,
  EndSession,
  GrantType,
  InteractionRecord,
  OidcStore,
  Provider,
  ProviderDiagnostic,
  ProviderDiagnosticReason,
  ProviderEndpoints,
  ProviderOptions,
  ProviderTtl,
  RefreshCheck,
  RefreshTokenRecord,
} from "./provider/types";
export type {
  OAuthErrorCode,
  OidcErr,
  OidcFailure,
  OidcIssue,
  OidcIssueCode,
  OidcOk,
  OidcPathSegment,
  OidcResult,
  Prompt,
  ProviderMetadata,
} from "./shared/types";
