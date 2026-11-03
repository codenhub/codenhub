/**
 * Sign users in through an OpenID Provider with a Fetch API client.
 *
 * @packageDocumentation
 */
export { createClient } from "./client/create-client";
export { discover } from "./client/discover";
export type * from "./client/types";
export type {
  IdTokenClaims,
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
  UserinfoClaims,
} from "./shared/types";
