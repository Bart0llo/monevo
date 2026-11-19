import type { UserRole } from '@monevo/contracts';
import type { Logger } from '../../infra/logger.js';
import type { IdTokenClaims } from '../../infra/oidc.js';

// Admin role from the IdP group (authentication.md#7-admin-bootstrap). Undefined when
// OIDC_ADMIN_GROUP is unset: roles are then managed in Monevo.

export function roleFromClaims(
  claims: Pick<IdTokenClaims, 'groups'>,
  adminGroup: string | undefined,
  logger: Logger,
): UserRole | undefined {
  if (adminGroup === undefined) return undefined;
  if (!Array.isArray(claims.groups)) {
    logger.warn(
      { event: 'auth.groups_claim_missing' },
      'OIDC_ADMIN_GROUP is set but the ID token has no groups claim; expose groups to Monevo in the identity provider',
    );
    return 'USER';
  }
  return claims.groups.includes(adminGroup) ? 'ADMIN' : 'USER';
}
