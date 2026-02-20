/**
 * Auth middleware module — exports + createAuthMiddleware.
 * Task 1000: RequestContext + Auth0 JWT + tenant-scoped handlers
 */

export type {
  RequestContext,
  VerifiedPrincipal,
  AuthAdapter,
  TenantResolver,
  Auth0Config,
} from './types.js';

export { DEFAULT_REQUEST_CONTEXT } from './types.js';
export { Auth0Adapter, getAuth0Config, isJwtShaped } from './auth0-adapter.js';
export { LocalTenantResolver, TenantResolutionError } from './tenant-resolver.js';
export {
  buildContextFromJwt,
  buildContextFromApiKey,
  buildContextFromDevHeaders,
  extractBearerToken,
} from './request-context.js';
