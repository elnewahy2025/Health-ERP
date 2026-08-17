import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Principal } from '../services/authorization.js';
import type { FastifyInstance } from 'fastify';

interface ServerWithAuth extends FastifyInstance {
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}

interface RequestWithMeta extends FastifyRequest {
  ctx?: {
    tenantId: string;
    userId: string;
    membershipId?: string;
    authorizationScope?: string;
    roles: string[];
    permissions: string[];
    branches: string[];
    locale: 'ar' | 'en';
    branchId?: string;
    departmentId?: string | null;
    requestId: string;
    principal: Principal;
  };
  tenantId?: string;
}

export function authGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const server = request.server as ServerWithAuth;
  return server.authenticate(request, reply);
}

export function getCtx(request: FastifyRequest) {
  const req = request as RequestWithMeta;
  return req.ctx!;
}

export function getTenantId(request: FastifyRequest): string {
  const req = request as RequestWithMeta;
  return req.tenantId || getCtx(request).tenantId;
}
