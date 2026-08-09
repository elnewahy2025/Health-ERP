import type { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '@healthcare/shared/errors';
import { hasPermission, type Principal } from '../services/authorization.js';

/**
 * Creates a preHandler that checks the authenticated user has ALL required permissions.
 * Usage: { preHandler: [authenticate, requirePermission('users.create', 'users.delete')] }
 */
export function requirePermission(...requiredPermissions: string[]) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    const req = request as FastifyRequest & {
      ctx?: { principal: Principal };
    };
    const principal = req.ctx?.principal;

    if (!principal) {
      throw new ForbiddenError('Authorization context missing');
    }
    for (const permission of requiredPermissions) {
      if (!hasPermission(principal, permission)) {
        throw new ForbiddenError(`Missing permission: ${permission}`);
      }
    }
  };
}
